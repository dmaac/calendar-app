"""
Integrated Health Score -- Combines nutrition, activity, and consistency
into a single 0-100 score for the user's overall health adherence.

Components:
- 40% Nutrition adherence (from nutrition_risk_service)
- 20% Activity/exercise consistency
- 25% Logging consistency (streak + regularity)
- 15% Hydration adherence
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.workout import WorkoutLog
from ..services.nutrition_risk_service import get_user_risk_summary

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Component calculators
# ---------------------------------------------------------------------------

async def _calc_nutrition_score(user_id: int, session: AsyncSession) -> int:
    """
    Nutrition score (0-100): inverse of avg_risk_score from risk summary.
    Higher risk = lower nutrition score.
    """
    summary = await get_user_risk_summary(user_id, session)
    avg_risk = summary.get("avg_risk_score", 100)
    return max(0, min(100, 100 - avg_risk))


async def _calc_activity_score(user_id: int, session: AsyncSession) -> int:
    """
    Activity score (0-100) based on workouts in the last 7 days.
    3+ workouts = 100, 2 = 70, 1 = 40, 0 = 0.
    """
    today = date.today()
    week_ago = today - timedelta(days=6)
    week_start = datetime.combine(week_ago, dt_time.min)
    week_end = datetime.combine(today, dt_time.max)

    result = await session.execute(
        select(func.count(WorkoutLog.id)).where(
            WorkoutLog.user_id == user_id,
            WorkoutLog.created_at >= week_start,
            WorkoutLog.created_at <= week_end,
        )
    )
    count = result.scalar() or 0

    if count >= 3:
        return 100
    elif count == 2:
        return 70
    elif count == 1:
        return 40
    return 0


async def _calc_consistency_score(user_id: int, session: AsyncSession) -> int:
    """
    Logging consistency score (0-100):
    - Base: days with at least 1 food log in last 7 days / 7 * 100
    - Bonus: current streak days (consecutive days with logs, up to +10 points)
    Capped at 100.
    """
    today = date.today()

    # Count days with at least 1 food log in the last 7 days
    days_with_logs = 0
    for i in range(7):
        check_date = today - timedelta(days=i)
        day_start = datetime.combine(check_date, dt_time.min)
        day_end = datetime.combine(check_date, dt_time.max)
        result = await session.execute(
            select(func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= day_start,
                AIFoodLog.logged_at <= day_end,
            )
        )
        if (result.scalar() or 0) > 0:
            days_with_logs += 1

    base_score = (days_with_logs / 7) * 100

    # Streak bonus: count consecutive days with logs going backwards from today
    streak = 0
    check_date = today
    while True:
        day_start = datetime.combine(check_date, dt_time.min)
        day_end = datetime.combine(check_date, dt_time.max)
        result = await session.execute(
            select(func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= day_start,
                AIFoodLog.logged_at <= day_end,
            )
        )
        if (result.scalar() or 0) == 0:
            break
        streak += 1
        check_date -= timedelta(days=1)
        if streak >= 30:
            break

    bonus = min(10, streak)
    return max(0, min(100, int(round(base_score + bonus))))


async def _calc_hydration_score(user_id: int, session: AsyncSession) -> int:
    """
    Hydration score (0-100): average water_ml from DailyNutritionSummary
    over the last 7 days. Target: 2500ml = 100%, proportional below.
    """
    today = date.today()
    week_ago = today - timedelta(days=6)

    result = await session.execute(
        select(func.avg(DailyNutritionSummary.water_ml)).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date >= week_ago,
            DailyNutritionSummary.date <= today,
        )
    )
    avg_water = result.scalar()
    if avg_water is None or avg_water <= 0:
        return 0

    return max(0, min(100, int(round((float(avg_water) / 2500.0) * 100))))


# ---------------------------------------------------------------------------
# Trend calculation
# ---------------------------------------------------------------------------

def _determine_trend(
    nutrition_score: int,
    activity_score: int,
    consistency_score: int,
    hydration_score: int,
) -> str:
    """
    Simple trend heuristic based on component scores.
    In a production system this would compare against historical data.
    """
    total = nutrition_score + activity_score + consistency_score + hydration_score
    avg = total / 4
    if avg >= 65:
        return "improving"
    elif avg >= 40:
        return "stable"
    return "declining"


def _determine_top_improvement(
    nutrition_score: int,
    activity_score: int,
    consistency_score: int,
    hydration_score: int,
) -> str:
    """Return the area with the lowest score as the top improvement opportunity."""
    scores = {
        "nutrition": nutrition_score,
        "activity": activity_score,
        "consistency": consistency_score,
        "hydration": hydration_score,
    }
    return min(scores, key=scores.get)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Main calculation
# ---------------------------------------------------------------------------

async def calculate_integrated_health_score(
    user_id: int, session: AsyncSession
) -> dict:
    """
    Calculate the integrated health score (0-100) combining:
    - 40% Nutrition adherence
    - 20% Activity/exercise consistency
    - 25% Logging consistency
    - 15% Hydration adherence

    Returns:
        {
            "total_score": int,       # 0-100
            "nutrition_score": int,
            "activity_score": int,
            "consistency_score": int,
            "hydration_score": int,
            "trend": str,             # "improving" | "stable" | "declining"
            "top_improvement": str,   # which area to improve most
        }
    """
    nutrition_score = await _calc_nutrition_score(user_id, session)
    activity_score = await _calc_activity_score(user_id, session)
    consistency_score = await _calc_consistency_score(user_id, session)
    hydration_score = await _calc_hydration_score(user_id, session)

    total_score = int(round(
        nutrition_score * 0.40
        + activity_score * 0.20
        + consistency_score * 0.25
        + hydration_score * 0.15
    ))
    total_score = max(0, min(100, total_score))

    trend = _determine_trend(
        nutrition_score, activity_score, consistency_score, hydration_score
    )
    top_improvement = _determine_top_improvement(
        nutrition_score, activity_score, consistency_score, hydration_score
    )

    return {
        "total_score": total_score,
        "nutrition_score": nutrition_score,
        "activity_score": activity_score,
        "consistency_score": consistency_score,
        "hydration_score": hydration_score,
        "trend": trend,
        "top_improvement": top_improvement,
    }
