"""
Progress System router — Gamification for nutrition adherence.

Existing endpoints (preserved):
POST /api/progress/post-meal        — process post-meal events, return celebrations
GET  /api/progress/weekly-summary   — weekly progress summary
GET  /api/progress/missions         — today's daily missions (legacy)

New endpoints:
GET  /api/progress/profile          — user's full progress profile
GET  /api/progress/achievements     — unlocked + available achievements
GET  /api/progress/missions/today   — today's 3 daily missions with status
GET  /api/progress/challenge/week   — current weekly challenge with status
GET  /api/progress/rewards          — reward catalog + user's coin balance
POST /api/progress/rewards/redeem   — redeem a reward
GET  /api/progress/history          — recent progress events
"""

import json
import logging
import random
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.progress import (
    AchievementDefinition,
    DailyMission,
    ProgressEvent,
    RewardCatalog,
    UserAchievement,
    UserDailyMissionStatus,
    UserRewardRedemption,
    UserWeeklyChallengeStatus,
    WeeklyChallenge,
)
from ..models.user import User
from ..services.celebration_engine import (
    process_post_meal_events,
    generate_weekly_summary,
)
from ..services.mission_engine import (
    assign_daily_missions,
    get_today_missions,
    update_mission_progress,
)
from ..services.progress_engine import (
    check_achievements,
    get_user_progress,
    redeem_reward,
)
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/progress", tags=["progress"])


# ─── Pydantic schemas ───────────────────────────────────────────────────────

class RedeemRequest(BaseModel):
    reward_id: int


# ─── POST /api/progress/post-meal (existing) ────────────────────────────────

@router.post("/post-meal")
async def post_meal_events(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Process post-meal events: award XP, check missions, trigger celebrations.
    Call this after a food log is saved.
    Returns list of celebrations to display in the UI.
    """
    celebrations = await process_post_meal_events(current_user.id, session)

    # Also update mission progress
    completed_missions = await update_mission_progress(current_user.id, session)

    # Add mission completion celebrations
    for mission in completed_missions:
        celebrations.append({
            "trigger": "mission_completed",
            "message": f"Mision completada: {mission['name']}! +{mission['xp_reward']} XP",
            "emoji": "\u2705",
            "intensity": "subtle",
            "data": mission,
        })

    await session.commit()

    return {
        "celebrations": celebrations,
        "missions_completed": completed_missions,
    }


# ─── GET /api/progress/weekly-summary (existing) ────────────────────────────

@router.get("/weekly-summary")
async def weekly_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Weekly progress summary: XP earned, coins, missions, achievements, streak, level.
    Best called on Sundays or when viewing the weekly recap screen.
    """
    summary = await generate_weekly_summary(current_user.id, session)
    return summary


# ─── GET /api/progress/missions (existing, legacy) ──────────────────────────

@router.get("/missions")
async def today_missions_legacy(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get today's daily missions. If not yet assigned, assigns them first
    based on the user's current risk status.
    """
    missions = await get_today_missions(current_user.id, session)

    if not missions:
        # Auto-assign missions based on risk status
        risk_status = "optimal"  # default
        try:
            from ..services.nutrition_risk_service import get_user_risk_summary
            risk_summary = await get_user_risk_summary(current_user.id, session)
            risk_status = risk_summary.get("current_status", "optimal")
        except Exception:
            pass

        missions = await assign_daily_missions(
            current_user.id, risk_status, session
        )
        await session.commit()

    return {"missions": missions}


# ─── GET /api/progress/profile ───────────────────────────────────────────────

@router.get("/profile")
async def get_progress_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Full progress profile: XP, level, streak, coins, achievements summary."""
    return await get_user_progress(current_user.id, session)


# ─── GET /api/progress/achievements ──────────────────────────────────────────

@router.get("/achievements")
async def get_achievements(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    category: Optional[str] = Query(None, description="Filter by category"),
):
    """User's unlocked achievements + available (locked) achievements."""
    # Get user's unlocked achievement IDs
    unlocked_result = await session.execute(
        select(UserAchievement).where(UserAchievement.user_id == current_user.id)
    )
    unlocked_rows = unlocked_result.scalars().all()
    unlocked_map = {ua.achievement_id: ua.unlocked_at for ua in unlocked_rows}

    # Get all achievement definitions
    query = select(AchievementDefinition).order_by(AchievementDefinition.sort_order)
    if category:
        query = query.where(AchievementDefinition.category == category)
    all_defs_result = await session.execute(query)
    all_defs = all_defs_result.scalars().all()

    achievements = []
    for defn in all_defs:
        is_unlocked = defn.id in unlocked_map
        # Hide hidden achievements that are not yet unlocked
        if defn.is_hidden and not is_unlocked:
            continue

        achievements.append({
            "id": defn.id,
            "code": defn.code,
            "name": defn.name,
            "description": defn.description,
            "category": defn.category,
            "rarity": defn.rarity,
            "icon": defn.icon,
            "xp_reward": defn.xp_reward,
            "coins_reward": defn.coins_reward,
            "unlocked": is_unlocked,
            "unlocked_at": unlocked_map[defn.id].isoformat() if is_unlocked and unlocked_map[defn.id] else None,
        })

    # Check for newly unlockable achievements
    newly_unlocked = await check_achievements(current_user.id, session)
    await session.commit()

    return {
        "achievements": achievements,
        "newly_unlocked": newly_unlocked,
        "total": len(all_defs),
        "unlocked_count": len(unlocked_map),
    }


# ─── GET /api/progress/missions/today ────────────────────────────────────────

@router.get("/missions/today")
async def get_today_missions_new(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Today's 3 daily missions with completion status (new format)."""
    today = date.today()

    # Check if missions are already assigned for today
    assigned_result = await session.execute(
        select(UserDailyMissionStatus).where(
            UserDailyMissionStatus.user_id == current_user.id,
            UserDailyMissionStatus.date == today,
        )
    )
    assigned = assigned_result.scalars().all()

    if len(assigned) >= 3:
        mission_ids = [a.mission_id for a in assigned]
        defs_result = await session.execute(
            select(DailyMission).where(DailyMission.id.in_(mission_ids))
        )
        defs_map = {d.id: d for d in defs_result.scalars().all()}

        missions = []
        for status_row in assigned:
            defn = defs_map.get(status_row.mission_id)
            if not defn:
                continue
            missions.append({
                "mission_id": defn.id,
                "code": defn.code,
                "name": defn.name,
                "description": defn.description,
                "xp_reward": defn.xp_reward,
                "coins_reward": defn.coins_reward,
                "difficulty": defn.difficulty,
                "completed": status_row.completed,
                "completed_at": status_row.completed_at.isoformat() if status_row.completed_at else None,
                "progress_value": status_row.progress_value,
            })

        return {"date": str(today), "missions": missions}

    # Assign 3 new missions: 1 easy, 1 medium, 1 hard
    all_missions_result = await session.execute(select(DailyMission))
    all_missions = all_missions_result.scalars().all()

    easy = [m for m in all_missions if m.difficulty == "easy"]
    medium = [m for m in all_missions if m.difficulty == "medium"]
    hard = [m for m in all_missions if m.difficulty == "hard"]

    selected = []
    if easy:
        selected.append(random.choice(easy))
    if medium:
        selected.append(random.choice(medium))
    if hard:
        selected.append(random.choice(hard))

    remaining = [m for m in all_missions if m not in selected]
    while len(selected) < 3 and remaining:
        pick = random.choice(remaining)
        selected.append(pick)
        remaining.remove(pick)

    missions = []
    for defn in selected:
        mission_status = UserDailyMissionStatus(
            user_id=current_user.id,
            mission_id=defn.id,
            date=today,
        )
        session.add(mission_status)

        missions.append({
            "mission_id": defn.id,
            "code": defn.code,
            "name": defn.name,
            "description": defn.description,
            "xp_reward": defn.xp_reward,
            "coins_reward": defn.coins_reward,
            "difficulty": defn.difficulty,
            "completed": False,
            "completed_at": None,
            "progress_value": 0,
        })

    await session.commit()

    return {"date": str(today), "missions": missions}


# ─── GET /api/progress/challenge/week ────────────────────────────────────────

@router.get("/challenge/week")
async def get_weekly_challenge(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Current weekly challenge with user's progress."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    status_result = await session.execute(
        select(UserWeeklyChallengeStatus).where(
            UserWeeklyChallengeStatus.user_id == current_user.id,
            UserWeeklyChallengeStatus.week_start == week_start,
        )
    )
    challenge_status = status_result.scalar_one_or_none()

    if challenge_status:
        defn_result = await session.execute(
            select(WeeklyChallenge).where(WeeklyChallenge.id == challenge_status.challenge_id)
        )
        defn = defn_result.scalar_one_or_none()
        if defn:
            return {
                "week_start": str(week_start),
                "week_end": str(week_start + timedelta(days=6)),
                "challenge": {
                    "id": defn.id,
                    "code": defn.code,
                    "name": defn.name,
                    "description": defn.description,
                    "xp_reward": defn.xp_reward,
                    "coins_reward": defn.coins_reward,
                    "difficulty": defn.difficulty,
                    "condition_value": defn.condition_value,
                },
                "progress": challenge_status.progress_value,
                "completed": challenge_status.completed,
                "days_remaining": max(0, (week_start + timedelta(days=6) - today).days),
            }

    # Assign a random weekly challenge
    all_challenges_result = await session.execute(select(WeeklyChallenge))
    all_challenges = all_challenges_result.scalars().all()

    if not all_challenges:
        return {"week_start": str(week_start), "challenge": None, "message": "No challenges available"}

    chosen = random.choice(all_challenges)
    new_status = UserWeeklyChallengeStatus(
        user_id=current_user.id,
        challenge_id=chosen.id,
        week_start=week_start,
    )
    session.add(new_status)
    await session.commit()

    return {
        "week_start": str(week_start),
        "week_end": str(week_start + timedelta(days=6)),
        "challenge": {
            "id": chosen.id,
            "code": chosen.code,
            "name": chosen.name,
            "description": chosen.description,
            "xp_reward": chosen.xp_reward,
            "coins_reward": chosen.coins_reward,
            "difficulty": chosen.difficulty,
            "condition_value": chosen.condition_value,
        },
        "progress": 0,
        "completed": False,
        "days_remaining": max(0, (week_start + timedelta(days=6) - today).days),
    }


# ─── GET /api/progress/rewards ───────────────────────────────────────────────

@router.get("/rewards")
async def get_rewards_catalog(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Reward catalog with user's coin balance and redemption history."""
    from ..services.progress_engine import _get_or_create_profile

    profile = await _get_or_create_profile(current_user.id, session)

    rewards_result = await session.execute(
        select(RewardCatalog).where(RewardCatalog.is_active == True)
    )
    rewards = rewards_result.scalars().all()

    # Get user's redemption counts
    user_redemptions_result = await session.execute(
        select(UserRewardRedemption).where(
            UserRewardRedemption.user_id == current_user.id
        ).order_by(UserRewardRedemption.redeemed_at.desc()).limit(50)
    )
    user_redemptions = user_redemptions_result.scalars().all()
    redeemed_counts: dict[int, int] = {}
    for r in user_redemptions:
        redeemed_counts[r.reward_id] = redeemed_counts.get(r.reward_id, 0) + 1

    catalog = []
    for reward in rewards:
        can_afford = profile.fitsia_coins_balance >= reward.cost_coins
        in_stock = reward.stock != 0
        catalog.append({
            "id": reward.id,
            "code": reward.code,
            "name": reward.name,
            "description": reward.description,
            "cost_coins": reward.cost_coins,
            "reward_type": reward.reward_type,
            "in_stock": in_stock,
            "stock": reward.stock if reward.stock >= 0 else None,
            "can_afford": can_afford,
            "times_redeemed": redeemed_counts.get(reward.id, 0),
        })

    return {
        "coins_balance": profile.fitsia_coins_balance,
        "streak_freezes": profile.streak_freezes_available,
        "catalog": catalog,
    }


# ─── POST /api/progress/rewards/redeem ───────────────────────────────────────

@router.post("/rewards/redeem")
async def redeem_reward_endpoint(
    body: RedeemRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Redeem a reward from the catalog using Fitsia coins."""
    result = await redeem_reward(current_user.id, body.reward_id, session)
    await session.commit()

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Redemption failed"),
        )

    return result


# ─── GET /api/progress/history ────────────────────────────────────────────────

@router.get("/history")
async def get_progress_history(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
):
    """Recent progress events (XP earned, level ups, achievements, etc.)."""
    query = (
        select(ProgressEvent)
        .where(ProgressEvent.user_id == current_user.id)
        .order_by(ProgressEvent.created_at.desc())
    )

    if event_type:
        query = query.where(ProgressEvent.event_type == event_type)

    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    events = result.scalars().all()

    count_query = select(sa_func.count(ProgressEvent.id)).where(
        ProgressEvent.user_id == current_user.id
    )
    if event_type:
        count_query = count_query.where(ProgressEvent.event_type == event_type)
    count_result = await session.execute(count_query)
    total = count_result.scalar() or 0

    return {
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "xp_amount": e.xp_amount,
                "coins_amount": e.coins_amount,
                "metadata": json.loads(e.metadata_json) if e.metadata_json else None,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
