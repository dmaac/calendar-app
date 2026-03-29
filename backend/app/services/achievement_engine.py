"""
Achievement Engine — comprehensive evaluation of 100 achievements.

AI TOKEN COST: ZERO. 100% rule-based evaluation.

Enhances the basic check_achievements in progress_engine.py with detailed
condition evaluation for all condition types: count, streak, threshold,
comeback, improvement, missions, level.

Achievement definitions are stored in the achievement_definition DB table
(seeded via scripts/seed_progress.py). This engine reads them and evaluates
user data against each condition.

All text in Spanish (target audience: LATAM).
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func, and_, distinct, case
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.progress import (
    AchievementDefinition,
    ProgressEvent,
    UserAchievement,
    UserDailyMissionStatus,
    UserProgressProfile,
    UserWeeklyChallengeStatus,
    WeeklyChallenge,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# User stats gathering — all data needed for achievement evaluation
# ---------------------------------------------------------------------------

async def _gather_user_stats(user_id: int, session: AsyncSession) -> dict:
    """Collect all metrics needed to evaluate achievement conditions.

    Returns a dict with:
    - total_meals, breakfast_count, lunch_count, dinner_count, snack_count
    - active_days, complete_days
    - calorie_adherence_days, protein_adherence_days
    - balanced_days, perfect_macro_days
    - diet_quality_80_days, diet_quality_90_days
    - high_protein_meals (>= 25g)
    - current_streak_days, best_streak_days
    - streak_freezes_used
    - missions_completed, full_day_missions (3/3 in a day)
    - challenges_completed
    - comeback_count
    - improvement_count
    - consecutive_improvement_days
    - left_critical (bool)
    - xp_total, level
    - motivation_state
    """
    today = date.today()

    # --- Profile data ---
    profile_q = await session.execute(
        select(UserProgressProfile).where(UserProgressProfile.user_id == user_id)
    )
    profile = profile_q.scalar_one_or_none()

    current_streak = profile.current_streak_days if profile else 0
    best_streak = profile.best_streak_days if profile else 0
    xp_total = profile.nutrition_xp_total if profile else 0
    level = profile.nutrition_level if profile else 1
    motivation_state = profile.motivation_state if profile else "new"

    # --- Total meals by type ---
    meal_counts = await session.execute(
        select(
            func.count().label("total"),
            func.count(case((AIFoodLog.meal_type == "breakfast", 1))).label("breakfast"),
            func.count(case((AIFoodLog.meal_type == "lunch", 1))).label("lunch"),
            func.count(case((AIFoodLog.meal_type == "dinner", 1))).label("dinner"),
            func.count(case((AIFoodLog.meal_type == "snack", 1))).label("snack"),
        ).where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
    )
    mc = meal_counts.one()

    # --- Active days (days with >= 1 log) ---
    active_days_q = await session.execute(
        select(func.count(distinct(func.date(AIFoodLog.logged_at)))).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    active_days = active_days_q.scalar() or 0

    # --- Complete days (3+ meals in a day) ---
    complete_days_q = await session.execute(
        select(func.count()).select_from(
            select(func.date(AIFoodLog.logged_at).label("d"))
            .where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
            .group_by(func.date(AIFoodLog.logged_at))
            .having(func.count() >= 3)
            .subquery()
        )
    )
    complete_days = complete_days_q.scalar() or 0

    # --- Calorie adherence days (ratio 0.85–1.15) ---
    cal_adh_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.calories_ratio >= 0.85,
                DailyNutritionAdherence.calories_ratio <= 1.15,
                DailyNutritionAdherence.no_log_flag == False,  # noqa: E712
            )
        )
    )
    calorie_adherence_days = cal_adh_q.scalar() or 0

    # --- Protein adherence days (logged >= 90% of target) ---
    prot_adh_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.protein_target > 0,
                DailyNutritionAdherence.protein_logged
                >= DailyNutritionAdherence.protein_target * 0.9,
                DailyNutritionAdherence.no_log_flag == False,  # noqa: E712
            )
        )
    )
    protein_adherence_days = prot_adh_q.scalar() or 0

    # --- High protein meals (>= 25g) ---
    high_prot_q = await session.execute(
        select(func.count()).where(
            and_(AIFoodLog.user_id == user_id, AIFoodLog.protein_g >= 25, AIFoodLog.deleted_at.is_(None))
        )
    )
    high_protein_meals = high_prot_q.scalar() or 0

    # --- Balanced days (cal ratio 0.85–1.15 AND protein 0.85–1.15) ---
    balanced_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.calories_ratio >= 0.85,
                DailyNutritionAdherence.calories_ratio <= 1.15,
                DailyNutritionAdherence.protein_target > 0,
                DailyNutritionAdherence.protein_logged
                >= DailyNutritionAdherence.protein_target * 0.85,
                DailyNutritionAdherence.protein_logged
                <= DailyNutritionAdherence.protein_target * 1.15,
                DailyNutritionAdherence.no_log_flag == False,  # noqa: E712
            )
        )
    )
    balanced_days = balanced_q.scalar() or 0

    # --- Diet quality 80+ / 90+ days ---
    dq80_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.diet_quality_score >= 80,
            )
        )
    )
    dq80 = dq80_q.scalar() or 0

    dq90_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.diet_quality_score >= 90,
            )
        )
    )
    dq90 = dq90_q.scalar() or 0

    # --- Missions completed ---
    missions_q = await session.execute(
        select(func.count()).where(
            and_(
                UserDailyMissionStatus.user_id == user_id,
                UserDailyMissionStatus.completed == True,  # noqa: E712
            )
        )
    )
    missions_completed = missions_q.scalar() or 0

    # --- Full day missions (3/3 in one day) ---
    full_day_q = await session.execute(
        select(func.count()).select_from(
            select(UserDailyMissionStatus.date)
            .where(
                and_(
                    UserDailyMissionStatus.user_id == user_id,
                    UserDailyMissionStatus.completed == True,  # noqa: E712
                )
            )
            .group_by(UserDailyMissionStatus.date)
            .having(func.count() >= 3)
            .subquery()
        )
    )
    full_day_missions = full_day_q.scalar() or 0

    # --- Weekly challenges completed ---
    challenges_q = await session.execute(
        select(func.count()).where(
            and_(
                UserWeeklyChallengeStatus.user_id == user_id,
                UserWeeklyChallengeStatus.completed == True,  # noqa: E712
            )
        )
    )
    challenges_completed = challenges_q.scalar() or 0

    # --- Comeback count (from progress events) ---
    comeback_q = await session.execute(
        select(func.count()).where(
            and_(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "xp_earned",
                ProgressEvent.metadata_json.contains("comeback"),
            )
        )
    )
    comeback_count = comeback_q.scalar() or 0

    # --- Improvement count (from progress events) ---
    improve_q = await session.execute(
        select(func.count()).where(
            and_(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "xp_earned",
                ProgressEvent.metadata_json.contains("improvement"),
            )
        )
    )
    improvement_count = improve_q.scalar() or 0

    # --- Streak freeze usage count ---
    freeze_q = await session.execute(
        select(func.count()).where(
            and_(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "streak_frozen",
            )
        )
    )
    freezes_used = freeze_q.scalar() or 0

    # --- Consecutive improvement days (risk score going down) ---
    recent_scores_q = await session.execute(
        select(
            DailyNutritionAdherence.date,
            DailyNutritionAdherence.nutrition_risk_score,
            DailyNutritionAdherence.adherence_status,
        )
        .where(DailyNutritionAdherence.user_id == user_id)
        .order_by(DailyNutritionAdherence.date.desc())
        .limit(10)
    )
    recent_scores = recent_scores_q.all()
    consecutive_improvement = 0
    left_critical = False
    if len(recent_scores) >= 2:
        for i in range(len(recent_scores) - 1):
            if recent_scores[i].nutrition_risk_score < recent_scores[i + 1].nutrition_risk_score:
                consecutive_improvement += 1
            else:
                break
        if recent_scores[0].adherence_status != "critical" and any(
            s.adherence_status == "critical" for s in recent_scores[1:]
        ):
            left_critical = True

    return {
        "total_meals": mc.total or 0,
        "breakfast_count": mc.breakfast or 0,
        "lunch_count": mc.lunch or 0,
        "dinner_count": mc.dinner or 0,
        "snack_count": mc.snack or 0,
        "active_days": active_days,
        "complete_days": complete_days,
        "calorie_adherence_days": calorie_adherence_days,
        "protein_adherence_days": protein_adherence_days,
        "high_protein_meals": high_protein_meals,
        "balanced_days": balanced_days,
        "diet_quality_80_days": dq80,
        "diet_quality_90_days": dq90,
        "current_streak_days": current_streak,
        "best_streak_days": best_streak,
        "streak_freezes_used": freezes_used,
        "missions_completed": missions_completed,
        "full_day_missions": full_day_missions,
        "challenges_completed": challenges_completed,
        "comeback_count": comeback_count,
        "improvement_count": improvement_count,
        "consecutive_improvement_days": consecutive_improvement,
        "left_critical": left_critical,
        "xp_total": xp_total,
        "level": level,
        "motivation_state": motivation_state,
    }


# ---------------------------------------------------------------------------
# Condition evaluation — maps condition_type to user stats
# ---------------------------------------------------------------------------

def _evaluate_condition(
    defn: AchievementDefinition,
    stats: dict,
) -> bool:
    """Check if an achievement condition is met given user stats.

    Achievement definitions use these condition_types:
    - count: total_meals >= value (constancia), calorie hits, protein hits, etc.
    - streak: best_streak_days >= value
    - threshold: XP >= value, green zone days, diet quality days, etc.
    - comeback: comeback_count >= value
    - improvement: improvement_count >= value
    - missions: missions_completed >= value
    - level: level >= value
    """
    ctype = defn.condition_type
    cval = defn.condition_value
    category = defn.category
    code = defn.code

    # --- count ---
    if ctype == "count":
        # Map by category/code to the right stat
        if category == "constancia":
            if "meals" in code:
                return stats["total_meals"] >= cval
            if "days_active" in code:
                return stats["active_days"] >= cval
            return stats["total_meals"] >= cval

        if category == "adherencia":
            if "calorie_hit" in code:
                return stats["calorie_adherence_days"] >= cval
            if "perfect_day" in code:
                return stats["balanced_days"] >= cval
            if "under_budget" in code:
                return stats["calorie_adherence_days"] >= cval
            if "balanced_week" in code:
                return stats["balanced_days"] >= cval
            return stats["calorie_adherence_days"] >= cval

        if category == "proteina":
            if "protein_hit" in code or "protein_king" in code or "protein_legend" in code:
                return stats["protein_adherence_days"] >= cval
            if "high_protein_meal" in code:
                return stats["high_protein_meals"] >= cval
            if "protein_variety" in code:
                return stats["high_protein_meals"] >= cval
            if "protein_breakfast" in code:
                return stats["breakfast_count"] >= cval
            return stats["protein_adherence_days"] >= cval

        if category == "equilibrio":
            if "macro_balance" in code or "balance_master" in code or "nutrition_guru" in code:
                return stats["balanced_days"] >= cval
            return stats["balanced_days"] >= cval

        if category == "misiones":
            if "triple_mission" in code:
                return stats["full_day_missions"] >= cval
            if "hard_mission" in code:
                return stats["missions_completed"] >= cval
            return stats["missions_completed"] >= cval

        if category == "desafios":
            if "challenge" in code or "overachiever" in code:
                return stats["challenges_completed"] >= cval
            return stats["challenges_completed"] >= cval

        if category == "rachas":
            if "freeze_saver" in code:
                return stats["streak_freezes_used"] >= cval
            return stats["best_streak_days"] >= cval

        if category == "reinicio":
            if "new_year" in code:
                return False  # Special calendar check — not evaluated here
            return stats["comeback_count"] >= cval

        if category == "temporadas":
            return False  # Season-based — requires separate season tracking

        # Fallback: use total meals
        return stats["total_meals"] >= cval

    # --- streak ---
    if ctype == "streak":
        if category == "proteina":
            # Protein streaks — approximate with protein adherence days
            return stats["protein_adherence_days"] >= cval
        if category == "rachas":
            return stats["best_streak_days"] >= cval
        if category == "equilibrio":
            # Hydration/balance streaks
            return stats["balanced_days"] >= cval
        if category == "desafios":
            # Challenge streaks — use challenges completed as proxy
            return stats["challenges_completed"] >= cval
        if category == "temporadas":
            return stats["best_streak_days"] >= cval
        if category == "reinicio":
            return stats["best_streak_days"] >= cval
        # Default: use best streak
        return stats["best_streak_days"] >= cval

    # --- threshold ---
    if ctype == "threshold":
        if category == "adherencia":
            # e.g. adherence_master: >90% for N consecutive days
            return stats["calorie_adherence_days"] >= cval
        if category == "mejora":
            if "green_zone" in code:
                return stats["diet_quality_80_days"] >= cval
            return stats["xp_total"] >= cval
        if category == "temporadas":
            return False  # Season-based — requires ranking data
        return stats["xp_total"] >= cval

    # --- comeback ---
    if ctype == "comeback":
        return stats["comeback_count"] >= cval

    # --- improvement ---
    if ctype == "improvement":
        if "left_critical" in code or "red_to_green" in code:
            return stats["left_critical"]
        if "consecutive" in code:
            return stats["consecutive_improvement_days"] >= cval
        return stats["improvement_count"] >= cval

    # --- missions ---
    if ctype == "missions":
        return stats["missions_completed"] >= cval

    # --- level ---
    if ctype == "level":
        return stats["level"] >= cval

    return False


# ---------------------------------------------------------------------------
# Main evaluation function
# ---------------------------------------------------------------------------

async def evaluate_achievements(
    user_id: int,
    session: AsyncSession,
) -> list[dict]:
    """Check all achievement conditions and unlock any newly earned ones.

    This is a comprehensive evaluator that reads all AchievementDefinition rows
    from the DB and checks user stats against each one. Newly unlocked achievements
    are recorded in user_achievement and XP/coins are awarded.

    Returns list of newly unlocked achievements with their rewards.
    """
    from .progress_engine import award_xp, award_coins, _get_or_create_profile, COIN_RULES

    # 1. Get already-unlocked achievement IDs
    unlocked_q = await session.execute(
        select(UserAchievement.achievement_id).where(
            UserAchievement.user_id == user_id
        )
    )
    unlocked_ids: set[int] = {r[0] for r in unlocked_q.all()}

    # 2. Get all achievement definitions
    all_defs_q = await session.execute(select(AchievementDefinition))
    all_defs = all_defs_q.scalars().all()

    if not all_defs:
        logger.warning("No achievement definitions found — run seed_progress.py first")
        return []

    # 3. Gather user stats (one big query batch)
    stats = await _gather_user_stats(user_id, session)

    # 4. Evaluate each definition
    newly_unlocked: list[dict] = []

    for defn in all_defs:
        if defn.id in unlocked_ids:
            continue

        if _evaluate_condition(defn, stats):
            # Record the unlock
            ua = UserAchievement(user_id=user_id, achievement_id=defn.id)
            session.add(ua)

            # Award XP
            if defn.xp_reward > 0:
                await award_xp(
                    user_id, defn.xp_reward,
                    f"achievement_{defn.code}", session,
                )

            # Award coins (base rarity bonus + definition bonus)
            coin_key = f"achievement_{defn.rarity}"
            coin_amount = COIN_RULES.get(coin_key, 0) + defn.coins_reward
            if coin_amount > 0:
                await award_coins(
                    user_id, coin_amount,
                    f"achievement_{defn.code}", session,
                )

            # Log event
            event = ProgressEvent(
                user_id=user_id,
                event_type="achievement_unlocked",
                xp_amount=defn.xp_reward,
                coins_amount=coin_amount,
                metadata_json=json.dumps({
                    "code": defn.code,
                    "name": defn.name,
                    "category": defn.category,
                    "rarity": defn.rarity,
                }),
            )
            session.add(event)

            newly_unlocked.append({
                "code": defn.code,
                "name": defn.name,
                "description": defn.description,
                "category": defn.category,
                "rarity": defn.rarity,
                "icon": defn.icon,
                "xp_reward": defn.xp_reward,
                "coins_reward": coin_amount,
                "is_hidden": defn.is_hidden,
            })

            logger.info(
                "Achievement unlocked: user_id=%d code=%s name=%s",
                user_id, defn.code, defn.name,
            )

    if newly_unlocked:
        await session.flush()
        logger.info(
            "User %d unlocked %d new achievements", user_id, len(newly_unlocked)
        )

    return newly_unlocked


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

async def get_all_achievements(
    user_id: int,
    session: AsyncSession,
) -> list[dict]:
    """Return all achievements with unlock status for a user.

    Hidden achievements that are not yet unlocked show masked info.
    """
    # Get unlocked map: achievement_id -> unlocked_at
    unlocked_q = await session.execute(
        select(UserAchievement.achievement_id, UserAchievement.unlocked_at).where(
            UserAchievement.user_id == user_id
        )
    )
    unlocked_map = {r[0]: r[1] for r in unlocked_q.all()}

    # Get all definitions ordered by sort_order
    all_defs_q = await session.execute(
        select(AchievementDefinition).order_by(AchievementDefinition.sort_order)
    )
    all_defs = all_defs_q.scalars().all()

    result = []
    for defn in all_defs:
        is_unlocked = defn.id in unlocked_map

        if defn.is_hidden and not is_unlocked:
            result.append({
                "id": defn.id,
                "code": defn.code,
                "name": "???",
                "description": "Logro oculto — desbloquea para descubrir",
                "icon": "help-circle-outline",
                "category": defn.category,
                "rarity": defn.rarity,
                "unlocked": False,
                "unlocked_at": None,
                "hidden": True,
                "xp_reward": defn.xp_reward,
                "coins_reward": defn.coins_reward,
            })
        else:
            result.append({
                "id": defn.id,
                "code": defn.code,
                "name": defn.name,
                "description": defn.description,
                "icon": defn.icon,
                "category": defn.category,
                "rarity": defn.rarity,
                "unlocked": is_unlocked,
                "unlocked_at": str(unlocked_map[defn.id]) if is_unlocked else None,
                "hidden": defn.is_hidden,
                "xp_reward": defn.xp_reward,
                "coins_reward": defn.coins_reward,
            })

    return result


async def get_achievements_by_category(
    user_id: int,
    category: str,
    session: AsyncSession,
) -> list[dict]:
    """Return achievements for a specific category with unlock status."""
    all_achievements = await get_all_achievements(user_id, session)
    return [a for a in all_achievements if a["category"] == category]


async def get_achievement_summary(
    user_id: int,
    session: AsyncSession,
) -> dict:
    """Return summary counts for the achievements screen."""
    unlocked_q = await session.execute(
        select(func.count()).where(UserAchievement.user_id == user_id)
    )
    unlocked_count = unlocked_q.scalar() or 0

    total_q = await session.execute(
        select(func.count()).select_from(AchievementDefinition)
    )
    total_count = total_q.scalar() or 0

    # Count by rarity
    rarity_q = await session.execute(
        select(
            AchievementDefinition.rarity,
            func.count().label("total"),
            func.count(UserAchievement.id).label("unlocked"),
        )
        .outerjoin(
            UserAchievement,
            and_(
                UserAchievement.achievement_id == AchievementDefinition.id,
                UserAchievement.user_id == user_id,
            ),
        )
        .group_by(AchievementDefinition.rarity)
    )
    rarity_breakdown = {
        r.rarity: {"total": r.total, "unlocked": r.unlocked}
        for r in rarity_q.all()
    }

    # Count by category
    category_q = await session.execute(
        select(
            AchievementDefinition.category,
            func.count().label("total"),
            func.count(UserAchievement.id).label("unlocked"),
        )
        .outerjoin(
            UserAchievement,
            and_(
                UserAchievement.achievement_id == AchievementDefinition.id,
                UserAchievement.user_id == user_id,
            ),
        )
        .group_by(AchievementDefinition.category)
    )
    category_breakdown = {
        r.category: {"total": r.total, "unlocked": r.unlocked}
        for r in category_q.all()
    }

    # Most recent unlock
    recent_q = await session.execute(
        select(UserAchievement, AchievementDefinition)
        .join(AchievementDefinition, AchievementDefinition.id == UserAchievement.achievement_id)
        .where(UserAchievement.user_id == user_id)
        .order_by(UserAchievement.unlocked_at.desc())
        .limit(1)
    )
    recent_row = recent_q.first()
    most_recent = None
    if recent_row:
        ua, defn = recent_row
        most_recent = {
            "code": defn.code,
            "name": defn.name,
            "icon": defn.icon,
            "rarity": defn.rarity,
            "unlocked_at": str(ua.unlocked_at) if ua.unlocked_at else None,
        }

    return {
        "unlocked": unlocked_count,
        "total": total_count,
        "completion_pct": round((unlocked_count / total_count * 100), 1) if total_count > 0 else 0,
        "by_rarity": rarity_breakdown,
        "by_category": category_breakdown,
        "most_recent": most_recent,
    }
