"""
Celebration Engine — Rule-based celebration events for nutrition progress.

AI TOKEN COST: ZERO. This entire module is 100% rule-based.
All celebrations, checks, and weekly summaries use deterministic Python logic
and SQL aggregations. No LLM / AI API calls are made anywhere in this file.

Triggers celebrations after food logging:
- First meal, first complete day, first week
- Exit red zone, recovered adherence, protein streaks
- Level ups, rare achievements, streak saves
- Weekly challenge completions, comebacks, all missions done
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.progress import (
    AchievementDefinition,
    DailyMission,
    ProgressEvent,
    UserAchievement,
    UserDailyMissionStatus,
    UserProgressProfile,
    UserWeeklyChallengeStatus,
    WeeklyChallenge,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Celebration event definitions (all messages in Spanish)
# ---------------------------------------------------------------------------

CELEBRATION_EVENTS: dict[str, dict] = {
    "first_meal": {
        "message": "Tu primera comida registrada! Asi se empieza.",
        "emoji": "\U0001f389",
        "intensity": "subtle",
    },
    "first_complete_day": {
        "message": "Dia completo! Ahora sabes exactamente lo que comiste.",
        "emoji": "\u2b50",
        "intensity": "medium",
    },
    "first_week": {
        "message": "Una semana entera registrando. Estas creando un habito real.",
        "emoji": "\U0001f525",
        "intensity": "high",
    },
    "exit_red_zone": {
        "message": "Saliste de la zona roja! Tu cuerpo te lo agradece.",
        "emoji": "\U0001f4aa",
        "intensity": "high",
    },
    "recovered_adherence": {
        "message": "Volviste al camino. Eso es fortaleza.",
        "emoji": "\U0001f31f",
        "intensity": "medium",
    },
    "protein_streak": {
        "message": "Varios dias cumpliendo proteina. Tu musculo crece.",
        "emoji": "\U0001f4aa",
        "intensity": "medium",
    },
    "level_up": {
        "message": "Subiste al nivel {level}! {level_name} desbloqueado.",
        "emoji": "\U0001f38a",
        "intensity": "high",
    },
    "rare_achievement": {
        "message": "Logro RARO desbloqueado: {name}!",
        "emoji": "\u2728",
        "intensity": "high",
    },
    "streak_saved": {
        "message": "Racha protegida! Tu constancia se mantiene.",
        "emoji": "\u2744\ufe0f",
        "intensity": "medium",
    },
    "weekly_challenge_done": {
        "message": "Desafio semanal completado! {coins} monedas ganadas.",
        "emoji": "\U0001f3c6",
        "intensity": "high",
    },
    "comeback": {
        "message": "Bienvenido de vuelta! {xp} XP de reenganche.",
        "emoji": "\U0001f64c",
        "intensity": "medium",
    },
    "all_missions_done": {
        "message": "Tres misiones completadas hoy! Bonus de {coins} monedas.",
        "emoji": "\u2705",
        "intensity": "medium",
    },
}

# Level names for level_up celebrations
LEVEL_NAMES: dict[int, str] = {
    1: "Principiante",
    2: "Aprendiz",
    3: "Explorador",
    4: "Comprometido",
    5: "Constante",
    6: "Disciplinado",
    7: "Avanzado",
    8: "Experto",
    9: "Maestro",
    10: "Leyenda",
}

# XP thresholds per level (cumulative)
LEVEL_THRESHOLDS: list[int] = [
    0,      # Level 1: 0 XP
    100,    # Level 2: 100 XP
    300,    # Level 3: 300 XP
    600,    # Level 4: 600 XP
    1000,   # Level 5: 1000 XP
    1500,   # Level 6: 1500 XP
    2200,   # Level 7: 2200 XP
    3000,   # Level 8: 3000 XP
    4000,   # Level 9: 4000 XP
    5500,   # Level 10: 5500 XP
]

# XP values for different actions
XP_MEAL_LOGGED = 10
XP_COMPLETE_DAY = 30
XP_PROTEIN_HIT = 15
XP_COMEBACK_BONUS = 50
COINS_ALL_MISSIONS_BONUS = 20


# ---------------------------------------------------------------------------
# Helper: get or create user progress profile
# ---------------------------------------------------------------------------

async def _get_or_create_profile(
    user_id: int, session: AsyncSession
) -> UserProgressProfile:
    result = await session.execute(
        select(UserProgressProfile).where(UserProgressProfile.user_id == user_id)
    )
    profile = result.scalars().first()
    if profile is None:
        profile = UserProgressProfile(user_id=user_id)
        session.add(profile)
        await session.flush()
    return profile


# ---------------------------------------------------------------------------
# Helper: count total food logs for a user
# ---------------------------------------------------------------------------

async def _count_total_logs(user_id: int, session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count(AIFoodLog.id)).where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
    )
    return result.scalar() or 0


# ---------------------------------------------------------------------------
# Helper: count distinct days with food logs
# ---------------------------------------------------------------------------

async def _count_logged_days(user_id: int, session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count(func.distinct(func.date(AIFoodLog.logged_at)))).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    return result.scalar() or 0


# ---------------------------------------------------------------------------
# Helper: count meals logged today
# ---------------------------------------------------------------------------

async def _count_today_meals(user_id: int, session: AsyncSession) -> int:
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    return result.scalar() or 0


# ---------------------------------------------------------------------------
# Helper: check if achievement already unlocked
# ---------------------------------------------------------------------------

async def _has_achievement(
    user_id: int, achievement_code: str, session: AsyncSession
) -> bool:
    result = await session.execute(
        select(func.count(UserAchievement.id))
        .join(AchievementDefinition, AchievementDefinition.id == UserAchievement.achievement_id)
        .where(
            UserAchievement.user_id == user_id,
            AchievementDefinition.code == achievement_code,
        )
    )
    return (result.scalar() or 0) > 0


# ---------------------------------------------------------------------------
# Helper: award XP and check level up
# ---------------------------------------------------------------------------

async def _award_xp(
    user_id: int, xp: int, session: AsyncSession
) -> Optional[dict]:
    """Award XP to user. Returns level_up celebration if threshold crossed."""
    profile = await _get_or_create_profile(user_id, session)
    old_level = profile.nutrition_level
    profile.nutrition_xp_total += xp
    profile.last_progress_event_at = datetime.now(timezone.utc)

    # Check level up
    new_level = old_level
    for lvl in range(len(LEVEL_THRESHOLDS) - 1, 0, -1):
        if profile.nutrition_xp_total >= LEVEL_THRESHOLDS[lvl]:
            new_level = lvl + 1
            break

    if new_level > old_level:
        profile.nutrition_level = new_level
        level_name = LEVEL_NAMES.get(new_level, f"Nivel {new_level}")
        session.add(profile)

        # Record level_up event
        event = ProgressEvent(
            user_id=user_id,
            event_type="level_up",
            xp_amount=0,
            coins_amount=0,
            metadata_json=json.dumps({"from": old_level, "to": new_level}),
        )
        session.add(event)

        celebration = dict(CELEBRATION_EVENTS["level_up"])
        celebration["message"] = celebration["message"].format(
            level=new_level, level_name=level_name
        )
        celebration["trigger"] = "level_up"
        celebration["data"] = {"level": new_level, "level_name": level_name}
        return celebration

    session.add(profile)
    return None


# ---------------------------------------------------------------------------
# Helper: award coins
# ---------------------------------------------------------------------------

async def _award_coins(
    user_id: int, coins: int, session: AsyncSession
) -> None:
    profile = await _get_or_create_profile(user_id, session)
    profile.fitsia_coins_balance += coins
    session.add(profile)

    event = ProgressEvent(
        user_id=user_id,
        event_type="coins_earned",
        xp_amount=0,
        coins_amount=coins,
    )
    session.add(event)


# ---------------------------------------------------------------------------
# Core: check and celebrate
# ---------------------------------------------------------------------------

async def check_and_celebrate(
    user_id: int, trigger: str, session: AsyncSession, **kwargs
) -> Optional[dict]:
    """Check if a celebration should fire. Returns celebration data or None."""
    event_def = CELEBRATION_EVENTS.get(trigger)
    if not event_def:
        return None

    celebration = dict(event_def)
    celebration["trigger"] = trigger

    # Format message with kwargs
    try:
        celebration["message"] = celebration["message"].format(**kwargs)
    except (KeyError, IndexError):
        pass

    celebration["data"] = kwargs
    return celebration


# ---------------------------------------------------------------------------
# Check: first meal
# ---------------------------------------------------------------------------

async def _check_first_meal(user_id: int, session: AsyncSession) -> Optional[dict]:
    total = await _count_total_logs(user_id, session)
    if total == 1:
        xp_celebration = await _award_xp(user_id, XP_MEAL_LOGGED, session)

        event = ProgressEvent(
            user_id=user_id,
            event_type="xp_earned",
            xp_amount=XP_MEAL_LOGGED,
            metadata_json=json.dumps({"source": "first_meal"}),
        )
        session.add(event)

        celebrations = [await check_and_celebrate(user_id, "first_meal", session)]
        if xp_celebration:
            celebrations.append(xp_celebration)
        return celebrations
    return None


# ---------------------------------------------------------------------------
# Check: first complete day (3+ meals in one day)
# ---------------------------------------------------------------------------

async def _check_first_complete_day(
    user_id: int, session: AsyncSession
) -> Optional[dict]:
    if await _has_achievement(user_id, "first_complete_day", session):
        return None

    today_meals = await _count_today_meals(user_id, session)
    if today_meals >= 3:
        return await check_and_celebrate(user_id, "first_complete_day", session)
    return None


# ---------------------------------------------------------------------------
# Check: first week (7+ distinct days with logs)
# ---------------------------------------------------------------------------

async def _check_first_week(user_id: int, session: AsyncSession) -> Optional[dict]:
    if await _has_achievement(user_id, "first_week", session):
        return None

    logged_days = await _count_logged_days(user_id, session)
    if logged_days >= 7:
        return await check_and_celebrate(user_id, "first_week", session)
    return None


# ---------------------------------------------------------------------------
# Check: exit red zone (risk status was critical/high_risk, now better)
# ---------------------------------------------------------------------------

async def _check_exit_red_zone(
    user_id: int, session: AsyncSession
) -> Optional[dict]:
    try:
        from .nutrition_risk_service import get_user_risk_summary

        summary = await get_user_risk_summary(user_id, session)
        current_status = summary.get("current_status", "")
        trend = summary.get("trend", "")

        if current_status in ("optimal", "low_adherence") and trend == "improving":
            # Check if there was a recent critical/high_risk status
            from ..models.nutrition_adherence import DailyNutritionAdherence

            yesterday = date.today() - timedelta(days=1)
            week_ago = date.today() - timedelta(days=7)
            result = await session.execute(
                select(DailyNutritionAdherence).where(
                    DailyNutritionAdherence.user_id == user_id,
                    DailyNutritionAdherence.date >= week_ago,
                    DailyNutritionAdherence.date <= yesterday,
                    DailyNutritionAdherence.nutrition_risk_score >= 70,
                )
            )
            high_risk_records = list(result.scalars().all())
            if high_risk_records:
                return await check_and_celebrate(user_id, "exit_red_zone", session)
    except Exception as exc:
        logger.debug("Could not check exit_red_zone: %s", exc)

    return None


# ---------------------------------------------------------------------------
# Check: protein streak (3+ consecutive days hitting protein target)
# ---------------------------------------------------------------------------

async def _check_protein_streak(
    user_id: int, session: AsyncSession
) -> Optional[dict]:
    try:
        from ..models.nutrition_adherence import DailyNutritionAdherence

        today = date.today()
        result = await session.execute(
            select(DailyNutritionAdherence)
            .where(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.date >= today - timedelta(days=2),
                DailyNutritionAdherence.date <= today,
            )
            .order_by(DailyNutritionAdherence.date.desc())
        )
        records = list(result.scalars().all())

        if len(records) >= 3:
            all_hit = all(
                r.protein_logged >= r.protein_target * 0.9 for r in records
                if r.protein_target > 0
            )
            if all_hit:
                return await check_and_celebrate(user_id, "protein_streak", session)
    except Exception as exc:
        logger.debug("Could not check protein_streak: %s", exc)

    return None


# ---------------------------------------------------------------------------
# Check: all daily missions completed
# ---------------------------------------------------------------------------

async def _check_all_missions_done(
    user_id: int, session: AsyncSession
) -> Optional[dict]:
    today = date.today()
    result = await session.execute(
        select(func.count(UserDailyMissionStatus.id)).where(
            UserDailyMissionStatus.user_id == user_id,
            UserDailyMissionStatus.date == today,
        )
    )
    total_missions = result.scalar() or 0

    if total_missions == 0:
        return None

    result_completed = await session.execute(
        select(func.count(UserDailyMissionStatus.id)).where(
            UserDailyMissionStatus.user_id == user_id,
            UserDailyMissionStatus.date == today,
            UserDailyMissionStatus.completed == True,
        )
    )
    completed_missions = result_completed.scalar() or 0

    if completed_missions >= 3 and completed_missions == total_missions:
        coins = COINS_ALL_MISSIONS_BONUS
        await _award_coins(user_id, coins, session)
        return await check_and_celebrate(
            user_id, "all_missions_done", session, coins=coins
        )

    return None


# ---------------------------------------------------------------------------
# Check: comeback (user returns after 3+ days of no logging)
# ---------------------------------------------------------------------------

async def _check_comeback(user_id: int, session: AsyncSession) -> Optional[dict]:
    try:
        from .nutrition_risk_service import get_consecutive_no_log_days

        # We need to check if they HAD a gap but now logged
        # If they just logged (today has meals), check yesterday's gap
        today_meals = await _count_today_meals(user_id, session)
        if today_meals != 1:
            # Only fire on the first meal back
            return None

        # Check the gap before today
        yesterday = date.today() - timedelta(days=1)
        result = await session.execute(
            select(func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= datetime.combine(
                    yesterday - timedelta(days=2), datetime.min.time()
                ),
                AIFoodLog.logged_at <= datetime.combine(yesterday, datetime.max.time()),
                AIFoodLog.deleted_at.is_(None),
            )
        )
        recent_logs = result.scalar() or 0

        if recent_logs == 0:
            # User had at least 3 days gap (yesterday, day before, day before that)
            xp = XP_COMEBACK_BONUS
            await _award_xp(user_id, xp, session)
            return await check_and_celebrate(user_id, "comeback", session, xp=xp)
    except Exception as exc:
        logger.debug("Could not check comeback: %s", exc)

    return None


# ---------------------------------------------------------------------------
# Main: process post-meal events
# ---------------------------------------------------------------------------

async def process_post_meal_events(
    user_id: int, session: AsyncSession
) -> list[dict]:
    """
    Called after food is logged. Returns list of celebrations to show.
    Steps:
    1. Award XP for the meal
    2. Check mission completion
    3. Check achievement unlocks
    4. Check streak status
    5. Return all celebrations
    """
    celebrations: list[dict] = []

    try:
        # 1. Award base XP for logging a meal
        xp_celebration = await _award_xp(user_id, XP_MEAL_LOGGED, session)
        if xp_celebration:
            celebrations.append(xp_celebration)

        event = ProgressEvent(
            user_id=user_id,
            event_type="xp_earned",
            xp_amount=XP_MEAL_LOGGED,
            metadata_json=json.dumps({"source": "meal_logged"}),
        )
        session.add(event)

        # 2. Check first meal
        first_meal = await _check_first_meal(user_id, session)
        if first_meal:
            if isinstance(first_meal, list):
                celebrations.extend([c for c in first_meal if c])
            elif first_meal:
                celebrations.append(first_meal)

        # 3. Check first complete day
        complete_day = await _check_first_complete_day(user_id, session)
        if complete_day:
            celebrations.append(complete_day)
            await _award_xp(user_id, XP_COMPLETE_DAY, session)

        # 4. Check first week
        first_week = await _check_first_week(user_id, session)
        if first_week:
            celebrations.append(first_week)

        # 5. Check exit red zone
        exit_red = await _check_exit_red_zone(user_id, session)
        if exit_red:
            celebrations.append(exit_red)

        # 6. Check protein streak
        protein = await _check_protein_streak(user_id, session)
        if protein:
            celebrations.append(protein)
            await _award_xp(user_id, XP_PROTEIN_HIT, session)

        # 7. Check comeback
        comeback = await _check_comeback(user_id, session)
        if comeback:
            celebrations.append(comeback)

        # 8. Check all missions done
        missions = await _check_all_missions_done(user_id, session)
        if missions:
            celebrations.append(missions)

        # 9. Evaluate ALL 100 achievements from achievement_engine
        try:
            from .achievement_engine import evaluate_achievements
            new_achievements = await evaluate_achievements(user_id, session)
            for ach in new_achievements:
                celebrations.append({
                    "type": "achievement_unlocked",
                    "message": f"Logro desbloqueado: {ach.get('name', '')}!",
                    "emoji": "🏆",
                    "intensity": "high" if ach.get("rarity") == "epic" else "medium",
                    "data": ach,
                })
        except Exception as exc:
            logger.warning("Achievement evaluation failed for user %d: %s", user_id, exc)

        # Flush all pending changes
        await session.flush()

    except Exception as exc:
        logger.error("Error processing post-meal events for user %d: %s", user_id, exc)

    return celebrations


# ---------------------------------------------------------------------------
# Weekly summary generator
# ---------------------------------------------------------------------------

async def generate_weekly_summary(
    user_id: int, session: AsyncSession
) -> dict:
    """
    Generate the Sunday weekly progress summary.
    Returns: {xp_earned, coins_earned, missions_completed, challenge_status,
              achievements_unlocked, streak_days, level_progress, motivational_message}
    """
    today = date.today()
    week_start = today - timedelta(days=6)

    # XP earned this week
    result = await session.execute(
        select(func.coalesce(func.sum(ProgressEvent.xp_amount), 0)).where(
            ProgressEvent.user_id == user_id,
            ProgressEvent.created_at >= datetime.combine(week_start, datetime.min.time()),
            ProgressEvent.created_at <= datetime.combine(today, datetime.max.time()),
        )
    )
    xp_earned = result.scalar() or 0

    # Coins earned this week
    result = await session.execute(
        select(func.coalesce(func.sum(ProgressEvent.coins_amount), 0)).where(
            ProgressEvent.user_id == user_id,
            ProgressEvent.created_at >= datetime.combine(week_start, datetime.min.time()),
            ProgressEvent.created_at <= datetime.combine(today, datetime.max.time()),
        )
    )
    coins_earned = result.scalar() or 0

    # Missions completed this week
    result = await session.execute(
        select(func.count(UserDailyMissionStatus.id)).where(
            UserDailyMissionStatus.user_id == user_id,
            UserDailyMissionStatus.date >= week_start,
            UserDailyMissionStatus.date <= today,
            UserDailyMissionStatus.completed == True,
        )
    )
    missions_completed = result.scalar() or 0

    # Weekly challenge status
    result = await session.execute(
        select(UserWeeklyChallengeStatus).where(
            UserWeeklyChallengeStatus.user_id == user_id,
            UserWeeklyChallengeStatus.week_start >= week_start,
        )
    )
    challenges = list(result.scalars().all())
    challenge_status = {
        "total": len(challenges),
        "completed": sum(1 for c in challenges if c.completed),
    }

    # Achievements unlocked this week
    result = await session.execute(
        select(func.count(UserAchievement.id)).where(
            UserAchievement.user_id == user_id,
            UserAchievement.unlocked_at >= datetime.combine(
                week_start, datetime.min.time()
            ),
            UserAchievement.unlocked_at <= datetime.combine(
                today, datetime.max.time()
            ),
        )
    )
    achievements_unlocked = result.scalar() or 0

    # Current streak and level
    profile = await _get_or_create_profile(user_id, session)
    streak_days = profile.current_streak_days
    current_level = profile.nutrition_level
    current_xp = profile.nutrition_xp_total

    # Level progress percentage
    next_level_xp = (
        LEVEL_THRESHOLDS[current_level]
        if current_level < len(LEVEL_THRESHOLDS)
        else LEVEL_THRESHOLDS[-1]
    )
    prev_level_xp = (
        LEVEL_THRESHOLDS[current_level - 1] if current_level > 1 else 0
    )
    xp_range = next_level_xp - prev_level_xp
    level_progress = (
        round((current_xp - prev_level_xp) / xp_range * 100, 1)
        if xp_range > 0
        else 100.0
    )
    level_progress = min(level_progress, 100.0)

    # Motivational message based on week performance
    motivational_message = _get_weekly_motivational_message(
        xp_earned=xp_earned,
        missions_completed=missions_completed,
        streak_days=streak_days,
    )

    return {
        "xp_earned": xp_earned,
        "coins_earned": coins_earned,
        "missions_completed": missions_completed,
        "challenge_status": challenge_status,
        "achievements_unlocked": achievements_unlocked,
        "streak_days": streak_days,
        "level_progress": level_progress,
        "current_level": current_level,
        "current_xp": current_xp,
        "motivational_message": motivational_message,
    }


def _get_weekly_motivational_message(
    xp_earned: int, missions_completed: int, streak_days: int
) -> str:
    """Generate a motivational message based on weekly performance. All Spanish."""
    if streak_days >= 7:
        return "Semana perfecta! 7 dias seguidos registrando. Eres imparable."
    if xp_earned >= 200:
        return "Semana increible! Ganaste mucha experiencia. Sigue asi."
    if missions_completed >= 15:
        return "Misionero estrella! Completaste muchas misiones esta semana."
    if streak_days >= 5:
        return "Gran semana! 5+ dias de constancia. Tu habito se esta formando."
    if missions_completed >= 7:
        return "Buen progreso esta semana. Cada mision cuenta."
    if xp_earned > 0:
        return "Cada registro suma. La proxima semana sera aun mejor."
    return "Nueva semana, nueva oportunidad. Tu plan te espera."
