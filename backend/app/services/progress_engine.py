"""
Fitsi AI Progress Engine -- XP, Levels, Streaks, Coins, and Achievements.

Core gamification engine for nutrition adherence. Manages experience points,
level progression, streak tracking, coin economy, and achievement evaluation.

IMPORTANT: Streak logic is delegated to streak_engine.py to avoid duplication.
This module's update_streak() is a thin wrapper around streak_engine.update_streak().
"""

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.progress import (
    AchievementDefinition,
    DailyMission,
    ProgressEvent,
    RewardCatalog,
    UserAchievement,
    UserDailyMissionStatus,
    UserProgressProfile,
    UserRewardRedemption,
    UserWeeklyChallengeStatus,
    WeeklyChallenge,
)

# Import streak engine to delegate streak logic (avoid duplication)
from . import streak_engine

logger = logging.getLogger(__name__)

# --- XP Rules ---------------------------------------------------------------

XP_RULES = {
    "register_meal": 10,
    "register_3_meals": 25,        # bonus for logging 3+ meals in a day
    "complete_day": 20,             # logged at least 1 meal for each main slot
    "hit_calorie_range": 30,       # within 10% of calorie target
    "hit_protein": 25,             # hit protein target (>= 90%)
    "complete_3_missions": 40,     # completed all 3 daily missions
    "streak_7": 100,               # 7-day streak bonus (coins, not XP)
    "comeback_after_3d": 50,       # returned after 3+ days inactive
    "comeback_after_7d": 75,       # returned after 7+ days inactive
    "improvement_3d": 30,          # adherence improved 3 consecutive days
}

XP_DAILY_MAX = 200

# --- Coin Rules --------------------------------------------------------------

COIN_RULES = {
    "streak_7": 50,
    "streak_14": 100,
    "streak_30": 250,
    "level_up": 25,
    "achievement_common": 10,
    "achievement_rare": 25,
    "achievement_epic": 50,
}

# --- Level Curve (20 levels) -------------------------------------------------

LEVELS = [
    {"level": 1,  "name": "Comienzo",          "xp_required": 0},
    {"level": 2,  "name": "En marcha",          "xp_required": 100},
    {"level": 3,  "name": "Constante",          "xp_required": 300},
    {"level": 4,  "name": "En control",         "xp_required": 600},
    {"level": 5,  "name": "Comprometido",       "xp_required": 1000},
    {"level": 6,  "name": "Enfoque total",      "xp_required": 1500},
    {"level": 7,  "name": "Habito firme",       "xp_required": 2200},
    {"level": 8,  "name": "Progreso real",      "xp_required": 3000},
    {"level": 9,  "name": "Disciplina activa",  "xp_required": 4000},
    {"level": 10, "name": "Ritmo solido",       "xp_required": 5500},
    {"level": 11, "name": "Dominando",          "xp_required": 7500},
    {"level": 12, "name": "Fuerza interior",    "xp_required": 10000},
    {"level": 13, "name": "Inquebrantable",     "xp_required": 13000},
    {"level": 14, "name": "Maestro nutricional", "xp_required": 17000},
    {"level": 15, "name": "Elite",              "xp_required": 22000},
    {"level": 16, "name": "Leyenda",            "xp_required": 28000},
    {"level": 17, "name": "Titan",              "xp_required": 35000},
    {"level": 18, "name": "Inmortal",           "xp_required": 44000},
    {"level": 19, "name": "Ascendido",          "xp_required": 55000},
    {"level": 20, "name": "Fitsi AI Supremo",    "xp_required": 70000},
]


def get_level_for_xp(xp: int) -> dict:
    """Return current level info + progress to next level.

    Args:
        xp: Total XP accumulated.

    Returns:
        dict with level, name, xp_total, xp_in_level, xp_for_next,
        progress_pct, next_level, next_name, is_max_level.
    """
    if xp < 0:
        xp = 0

    current = LEVELS[0]
    for lvl in LEVELS:
        if xp >= lvl["xp_required"]:
            current = lvl
        else:
            break

    current_idx = current["level"] - 1
    if current_idx < len(LEVELS) - 1:
        next_lvl = LEVELS[current_idx + 1]
        xp_in_level = xp - current["xp_required"]
        xp_for_level = next_lvl["xp_required"] - current["xp_required"]
        progress_pct = round((xp_in_level / xp_for_level) * 100, 1) if xp_for_level > 0 else 100.0
    else:
        next_lvl = None
        xp_in_level = 0
        xp_for_level = 0
        progress_pct = 100.0

    return {
        "level": current["level"],
        "name": current["name"],
        "xp_total": xp,
        "xp_in_level": xp_in_level,
        "xp_for_next": xp_for_level,
        "progress_pct": progress_pct,
        "next_level": next_lvl["level"] if next_lvl else None,
        "next_name": next_lvl["name"] if next_lvl else None,
        "is_max_level": next_lvl is None,
    }


async def _get_or_create_profile(user_id: int, session: AsyncSession) -> UserProgressProfile:
    """Get or create progress profile for a user."""
    result = await session.execute(
        select(UserProgressProfile).where(UserProgressProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProgressProfile(user_id=user_id)
        session.add(profile)
        await session.flush()
    return profile


async def _get_today_xp(user_id: int, session: AsyncSession) -> int:
    """Get total XP earned today (for daily cap enforcement)."""
    today_start = datetime.combine(date.today(), datetime.min.time())
    result = await session.execute(
        select(sa_func.coalesce(sa_func.sum(ProgressEvent.xp_amount), 0)).where(
            ProgressEvent.user_id == user_id,
            ProgressEvent.event_type == "xp_earned",
            ProgressEvent.created_at >= today_start,
        )
    )
    return result.scalar_one() or 0


async def _log_event(
    user_id: int,
    event_type: str,
    session: AsyncSession,
    xp_amount: int = 0,
    coins_amount: int = 0,
    metadata: Optional[dict] = None,
) -> ProgressEvent:
    """Create a progress event record."""
    event = ProgressEvent(
        user_id=user_id,
        event_type=event_type,
        xp_amount=xp_amount,
        coins_amount=coins_amount,
        metadata_json=json.dumps(metadata) if metadata else None,
    )
    session.add(event)
    await session.flush()
    return event


async def award_xp(
    user_id: int,
    amount: int,
    reason: str,
    session: AsyncSession,
) -> dict:
    """Add XP to user, enforcing daily cap. Check for level up.

    Args:
        user_id: The user to award XP to.
        amount: Desired XP amount (will be capped at daily max).
        reason: Human-readable reason for the XP award.
        session: Async DB session.

    Returns:
        {xp_added, new_total, level_up, new_level, capped}.
    """
    if amount <= 0:
        return {
            "xp_added": 0,
            "new_total": 0,
            "level_up": False,
            "new_level": None,
            "capped": False,
        }

    try:
        profile = await _get_or_create_profile(user_id, session)
        today_xp = await _get_today_xp(user_id, session)

        remaining_cap = max(0, XP_DAILY_MAX - today_xp)
        actual_xp = min(amount, remaining_cap)
        capped = actual_xp < amount

        if actual_xp <= 0:
            return {
                "xp_added": 0,
                "new_total": profile.nutrition_xp_total,
                "level_up": False,
                "new_level": None,
                "capped": True,
            }

        old_level = get_level_for_xp(profile.nutrition_xp_total)["level"]
        profile.nutrition_xp_total += actual_xp
        profile.last_progress_event_at = datetime.now(timezone.utc)

        new_level_info = get_level_for_xp(profile.nutrition_xp_total)
        level_up = new_level_info["level"] > old_level

        if level_up:
            profile.nutrition_level = new_level_info["level"]
            coins_for_level = COIN_RULES["level_up"]
            profile.fitsia_coins_balance += coins_for_level
            await _log_event(
                user_id, "level_up", session,
                xp_amount=0, coins_amount=coins_for_level,
                metadata={"old_level": old_level, "new_level": new_level_info["level"], "name": new_level_info["name"]},
            )
            logger.info(
                "Level up: user_id=%d %d->%d (%s)",
                user_id, old_level, new_level_info["level"], new_level_info["name"],
            )

        await _log_event(
            user_id, "xp_earned", session,
            xp_amount=actual_xp,
            metadata={"reason": reason, "capped": capped},
        )

        await session.flush()

        return {
            "xp_added": actual_xp,
            "new_total": profile.nutrition_xp_total,
            "level_up": level_up,
            "new_level": new_level_info if level_up else None,
            "capped": capped,
        }
    except Exception:
        logger.exception("Error awarding XP: user_id=%d amount=%d reason=%s", user_id, amount, reason)
        raise


async def award_coins(
    user_id: int,
    amount: int,
    reason: str,
    session: AsyncSession,
) -> dict:
    """Add coins to user balance.

    Args:
        user_id: The user.
        amount: Number of coins to add (must be > 0).
        reason: Human-readable reason.
        session: Async DB session.

    Returns:
        {coins_added, new_balance}.
    """
    if amount <= 0:
        logger.warning("Attempted to award non-positive coins: user_id=%d amount=%d", user_id, amount)
        return {"coins_added": 0, "new_balance": 0}

    try:
        profile = await _get_or_create_profile(user_id, session)
        profile.fitsia_coins_balance += amount
        profile.last_progress_event_at = datetime.now(timezone.utc)

        await _log_event(
            user_id, "coins_earned", session,
            coins_amount=amount,
            metadata={"reason": reason},
        )
        await session.flush()

        return {
            "coins_added": amount,
            "new_balance": profile.fitsia_coins_balance,
        }
    except Exception:
        logger.exception("Error awarding coins: user_id=%d amount=%d", user_id, amount)
        raise


async def update_streak(user_id: int, session: AsyncSession) -> dict:
    """Delegate to streak_engine.update_streak to avoid duplicated logic.

    The streak_engine version has proper double-counting protection,
    milestone tracking, and freeze management.

    Returns:
        {streak_days, extended, frozen, lost, best_streak, milestone_hit, is_at_risk}.
    """
    return await streak_engine.update_streak(user_id, session)


def _compute_calorie_adherence_pct(adherence: DailyNutritionAdherence) -> Optional[float]:
    """Compute calorie adherence percentage from the model's fields.

    The model stores calories_ratio (logged/target). We convert to percentage.
    Returns None if data is insufficient.
    """
    if adherence.calories_target <= 0:
        return None
    return round((adherence.calories_logged / adherence.calories_target) * 100, 1)


def _compute_protein_adherence_pct(adherence: DailyNutritionAdherence) -> Optional[float]:
    """Compute protein adherence percentage from logged vs target.

    Returns None if target is 0 or not set.
    """
    if adherence.protein_target <= 0:
        return None
    return round((adherence.protein_logged / adherence.protein_target) * 100, 1)


async def process_daily_progress(user_id: int, session: AsyncSession) -> dict:
    """Evaluate all XP-worthy actions for the day and award XP accordingly.

    Called when a user logs food or at end of day via batch job.

    Returns summary of all XP/coins awarded, streak status, and profile state.
    """
    try:
        profile = await _get_or_create_profile(user_id, session)
        today = date.today()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())

        awards: list[dict] = []

        # 1. Count meals logged today
        meal_count_result = await session.execute(
            select(sa_func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
                AIFoodLog.deleted_at.is_(None),
            )
        )
        meals_today = meal_count_result.scalar_one() or 0

        if meals_today >= 1:
            result = await award_xp(user_id, XP_RULES["register_meal"], "register_meal", session)
            awards.append({"action": "register_meal", **result})

        if meals_today >= 3:
            result = await award_xp(user_id, XP_RULES["register_3_meals"], "register_3_meals", session)
            awards.append({"action": "register_3_meals", **result})

        # 2. Check meal type coverage (breakfast, lunch, dinner)
        meal_types_result = await session.execute(
            select(sa_func.count(sa_func.distinct(AIFoodLog.meal_type))).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
                AIFoodLog.deleted_at.is_(None),
            )
        )
        distinct_meal_types = meal_types_result.scalar_one() or 0
        if distinct_meal_types >= 3:
            result = await award_xp(user_id, XP_RULES["complete_day"], "complete_day", session)
            awards.append({"action": "complete_day", **result})

        # 3. Check calorie adherence (within 10% of target)
        # FIX: The model uses calories_ratio and protein_logged/protein_target,
        # NOT calorie_adherence_pct / protein_adherence_pct (those fields do not exist).
        adherence_result = await session.execute(
            select(DailyNutritionAdherence).where(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.date == today,
            )
        )
        adherence = adherence_result.scalar_one_or_none()

        if adherence:
            calorie_pct = _compute_calorie_adherence_pct(adherence)
            if calorie_pct is not None and 90 <= calorie_pct <= 110:
                result = await award_xp(user_id, XP_RULES["hit_calorie_range"], "hit_calorie_range", session)
                awards.append({"action": "hit_calorie_range", **result})

            protein_pct = _compute_protein_adherence_pct(adherence)
            if protein_pct is not None and protein_pct >= 90:
                result = await award_xp(user_id, XP_RULES["hit_protein"], "hit_protein", session)
                awards.append({"action": "hit_protein", **result})

        # 4. Check daily missions completion
        missions_result = await session.execute(
            select(sa_func.count(UserDailyMissionStatus.id)).where(
                UserDailyMissionStatus.user_id == user_id,
                UserDailyMissionStatus.date == today,
                UserDailyMissionStatus.completed == True,  # noqa: E712
            )
        )
        missions_completed = missions_result.scalar_one() or 0
        if missions_completed >= 3:
            result = await award_xp(user_id, XP_RULES["complete_3_missions"], "complete_3_missions", session)
            awards.append({"action": "complete_3_missions", **result})

        # 5. Check comeback bonus (returning after inactivity)
        if profile.last_progress_event_at:
            days_inactive = (datetime.now(timezone.utc) - profile.last_progress_event_at).days
            if days_inactive >= 7:
                result = await award_xp(user_id, XP_RULES["comeback_after_7d"], "comeback_after_7d", session)
                awards.append({"action": "comeback_after_7d", **result})
                profile.motivation_state = "returning"
            elif days_inactive >= 3:
                result = await award_xp(user_id, XP_RULES["comeback_after_3d"], "comeback_after_3d", session)
                awards.append({"action": "comeback_after_3d", **result})
                profile.motivation_state = "returning"
            else:
                profile.motivation_state = "active"
        else:
            profile.motivation_state = "active"

        # 6. Check 3-day improvement trend
        # FIX: Use diet_quality_score instead of non-existent overall_score
        three_days_ago = today - timedelta(days=3)
        trend_result = await session.execute(
            select(DailyNutritionAdherence.diet_quality_score).where(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.date >= three_days_ago,
                DailyNutritionAdherence.date <= today,
            ).order_by(DailyNutritionAdherence.date.asc())
        )
        scores = [row[0] for row in trend_result.all() if row[0] is not None]
        if len(scores) >= 3:
            improving = all(scores[i] < scores[i + 1] for i in range(len(scores) - 1))
            if improving:
                result = await award_xp(user_id, XP_RULES["improvement_3d"], "improvement_3d", session)
                awards.append({"action": "improvement_3d", **result})

        # Update streak (delegated to streak_engine)
        streak_result = await update_streak(user_id, session)

        await session.commit()

        total_xp = sum(a.get("xp_added", 0) for a in awards)
        logger.info(
            "Daily progress processed: user_id=%d total_xp=%d awards=%d streak=%d",
            user_id, total_xp, len(awards), streak_result.get("streak_days", 0),
        )

        return {
            "user_id": user_id,
            "date": str(today),
            "awards": awards,
            "total_xp_earned": total_xp,
            "streak": streak_result,
            "profile": {
                "xp_total": profile.nutrition_xp_total,
                "level": profile.nutrition_level,
                "coins": profile.fitsia_coins_balance,
                "motivation_state": profile.motivation_state,
            },
        }
    except Exception:
        await session.rollback()
        logger.exception("Error processing daily progress: user_id=%d", user_id)
        raise


async def check_achievements(user_id: int, session: AsyncSession) -> list[dict]:
    """Evaluate all achievement definitions against user state.

    Unlocks any newly earned achievements and awards associated XP/coins.

    PERF: Pre-fetches all needed counts in batch queries upfront instead of
    issuing individual queries per achievement definition inside the loop
    (eliminates N+1 query pattern).

    Returns:
        List of newly unlocked achievement dicts.
    """
    try:
        profile = await _get_or_create_profile(user_id, session)

        # Get already unlocked achievement IDs
        unlocked_result = await session.execute(
            select(UserAchievement.achievement_id).where(UserAchievement.user_id == user_id)
        )
        unlocked_ids = {row[0] for row in unlocked_result.all()}

        # Get all achievement definitions
        all_defs_result = await session.execute(select(AchievementDefinition))
        all_defs = all_defs_result.scalars().all()

        # ── Batch pre-fetch: run all needed counts ONCE upfront ──────────
        # Total meals logged (for "count" condition type)
        count_result = await session.execute(
            select(sa_func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.deleted_at.is_(None),
            )
        )
        total_meals = count_result.scalar_one() or 0

        # Comeback events count (for "comeback" condition type)
        comeback_result = await session.execute(
            select(sa_func.count(ProgressEvent.id)).where(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "xp_earned",
                ProgressEvent.metadata_json.contains("comeback"),
            )
        )
        total_comebacks = comeback_result.scalar_one() or 0

        # Improvement events count (for "improvement" condition type)
        improve_result = await session.execute(
            select(sa_func.count(ProgressEvent.id)).where(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "xp_earned",
                ProgressEvent.metadata_json.contains("improvement"),
            )
        )
        total_improvements = improve_result.scalar_one() or 0

        # Completed missions count (for "missions" condition type)
        missions_result = await session.execute(
            select(sa_func.count(UserDailyMissionStatus.id)).where(
                UserDailyMissionStatus.user_id == user_id,
                UserDailyMissionStatus.completed == True,  # noqa: E712
            )
        )
        total_missions = missions_result.scalar_one() or 0

        # ── Evaluate each definition using pre-fetched stats ─────────────
        newly_unlocked: list[dict] = []

        for defn in all_defs:
            if defn.id in unlocked_ids:
                continue

            earned = False

            if defn.condition_type == "streak":
                earned = profile.best_streak_days >= defn.condition_value

            elif defn.condition_type == "count":
                earned = total_meals >= defn.condition_value

            elif defn.condition_type == "threshold":
                earned = profile.nutrition_xp_total >= defn.condition_value

            elif defn.condition_type == "comeback":
                earned = total_comebacks >= defn.condition_value

            elif defn.condition_type == "improvement":
                earned = total_improvements >= defn.condition_value

            elif defn.condition_type == "level":
                earned = profile.nutrition_level >= defn.condition_value

            elif defn.condition_type == "missions":
                earned = total_missions >= defn.condition_value

            else:
                logger.warning(
                    "Unknown achievement condition_type=%s for code=%s",
                    defn.condition_type, defn.code,
                )

            if earned:
                ua = UserAchievement(user_id=user_id, achievement_id=defn.id)
                session.add(ua)

                # Award XP and coins for the achievement
                if defn.xp_reward > 0:
                    await award_xp(user_id, defn.xp_reward, f"achievement_{defn.code}", session)
                coin_key = f"achievement_{defn.rarity}"
                coin_amount = COIN_RULES.get(coin_key, 0) + defn.coins_reward
                if coin_amount > 0:
                    await award_coins(user_id, coin_amount, f"achievement_{defn.code}", session)

                await _log_event(
                    user_id, "achievement_unlocked", session,
                    xp_amount=defn.xp_reward,
                    coins_amount=coin_amount,
                    metadata={"code": defn.code, "name": defn.name, "rarity": defn.rarity},
                )

                newly_unlocked.append({
                    "code": defn.code,
                    "name": defn.name,
                    "description": defn.description,
                    "category": defn.category,
                    "rarity": defn.rarity,
                    "icon": defn.icon,
                    "xp_reward": defn.xp_reward,
                    "coins_reward": coin_amount,
                })

                logger.info(
                    "Achievement unlocked: user_id=%d code=%s rarity=%s",
                    user_id, defn.code, defn.rarity,
                )

        if newly_unlocked:
            await session.flush()

        return newly_unlocked
    except Exception:
        logger.exception("Error checking achievements: user_id=%d", user_id)
        raise


async def redeem_reward(
    user_id: int,
    reward_id: int,
    session: AsyncSession,
) -> dict:
    """Redeem a reward from the catalog. Deducts coins.

    Uses SELECT ... FOR UPDATE on the reward to prevent TOCTOU race conditions
    on stock count in concurrent requests.

    Returns:
        {success, reward, new_balance} or {success: False, error: ...}.
    """
    try:
        profile = await _get_or_create_profile(user_id, session)

        # Use FOR UPDATE to prevent TOCTOU race on stock
        result = await session.execute(
            select(RewardCatalog)
            .where(RewardCatalog.id == reward_id, RewardCatalog.is_active == True)  # noqa: E712
            .with_for_update()
        )
        reward = result.scalar_one_or_none()
        if not reward:
            return {"success": False, "error": "Reward not found or inactive"}

        if profile.fitsia_coins_balance < reward.cost_coins:
            return {
                "success": False,
                "error": "Insufficient coins",
                "balance": profile.fitsia_coins_balance,
                "cost": reward.cost_coins,
            }

        if reward.stock == 0:
            return {"success": False, "error": "Reward out of stock"}

        # Deduct coins
        profile.fitsia_coins_balance -= reward.cost_coins

        # Decrement stock (stock == -1 means unlimited)
        if reward.stock > 0:
            reward.stock -= 1

        redemption = UserRewardRedemption(
            user_id=user_id,
            reward_id=reward_id,
            coins_spent=reward.cost_coins,
        )
        session.add(redemption)

        # Apply reward effect
        if reward.reward_type == "streak_freeze":
            profile.streak_freezes_available += 1

        await _log_event(
            user_id, "reward_redeemed", session,
            coins_amount=-reward.cost_coins,
            metadata={"reward_code": reward.code, "reward_type": reward.reward_type},
        )

        await session.flush()

        logger.info(
            "Reward redeemed: user_id=%d reward=%s coins_spent=%d",
            user_id, reward.code, reward.cost_coins,
        )

        return {
            "success": True,
            "reward": {
                "code": reward.code,
                "name": reward.name,
                "type": reward.reward_type,
            },
            "coins_spent": reward.cost_coins,
            "new_balance": profile.fitsia_coins_balance,
        }
    except Exception:
        logger.exception("Error redeeming reward: user_id=%d reward_id=%d", user_id, reward_id)
        raise


async def get_user_progress(user_id: int, session: AsyncSession) -> dict:
    """Full progress profile for the frontend.

    Returns comprehensive user gamification state including XP, level,
    streak, coins, achievements, missions, and recent events.
    """
    try:
        profile = await _get_or_create_profile(user_id, session)
        level_info = get_level_for_xp(profile.nutrition_xp_total)

        # Count achievements
        ach_result = await session.execute(
            select(sa_func.count(UserAchievement.id)).where(UserAchievement.user_id == user_id)
        )
        achievements_unlocked = ach_result.scalar_one() or 0

        total_ach_result = await session.execute(
            select(sa_func.count(AchievementDefinition.id))
        )
        achievements_total = total_ach_result.scalar_one() or 0

        # Today's missions
        today = date.today()
        missions_result = await session.execute(
            select(sa_func.count(UserDailyMissionStatus.id)).where(
                UserDailyMissionStatus.user_id == user_id,
                UserDailyMissionStatus.date == today,
                UserDailyMissionStatus.completed == True,  # noqa: E712
            )
        )
        missions_done_today = missions_result.scalar_one() or 0

        # Recent events (last 10)
        events_result = await session.execute(
            select(ProgressEvent)
            .where(ProgressEvent.user_id == user_id)
            .order_by(ProgressEvent.created_at.desc())
            .limit(10)
        )
        recent_events = [
            {
                "event_type": e.event_type,
                "xp_amount": e.xp_amount,
                "coins_amount": e.coins_amount,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "metadata": json.loads(e.metadata_json) if e.metadata_json else None,
            }
            for e in events_result.scalars().all()
        ]

        return {
            "user_id": user_id,
            "xp_total": profile.nutrition_xp_total,
            "level": level_info,
            "streak": {
                "current": profile.current_streak_days,
                "best": profile.best_streak_days,
                "freezes_available": profile.streak_freezes_available,
            },
            "coins_balance": profile.fitsia_coins_balance,
            "motivation_state": profile.motivation_state,
            "achievements": {
                "unlocked": achievements_unlocked,
                "total": achievements_total,
            },
            "missions_done_today": missions_done_today,
            "recent_events": recent_events,
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
        }
    except Exception:
        logger.exception("Error getting user progress: user_id=%d", user_id)
        raise


async def get_progress_with_analytics(user_id: int, session: AsyncSession) -> dict:
    """
    Enhanced progress profile that includes analytics from insights_service.

    Combines gamification state (XP, level, coins, achievements) with
    nutrition analytics (streak stats, calorie consistency, macro balance).
    Useful for a unified "progress + stats" screen in the mobile app.
    """
    from .insights_service import (
        get_calorie_consistency,
        get_macro_balance_score,
        get_streak_statistics,
    )

    # Get base progress data
    progress = await get_user_progress(user_id, session)

    # Enrich with analytics — each function has its own cache
    streak_stats = await get_streak_statistics(user_id, session)
    consistency = await get_calorie_consistency(user_id, session, days=14)
    macro_balance = await get_macro_balance_score(user_id, session, days=7)

    progress["analytics"] = {
        "streak_statistics": streak_stats,
        "calorie_consistency": consistency,
        "macro_balance_score": macro_balance.get("overall_score", 0),
    }

    return progress
