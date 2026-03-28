"""
Insights Service — Personalized daily insights + deep per-user analytics.

Provides:
- Daily insights (actionable tips based on today's data)
- Weekly/monthly calorie trends (linear regression via SQL)
- Macro balance scoring (how well the user hits protein/carbs/fat targets)
- Streak statistics (current, longest, total days logged)
- Most-eaten foods ranking
- Meal timing analysis (when does the user typically eat?)
- Calorie consistency score (coefficient of variation of daily intake)
- Progress toward weight/nutrition goal

All analytics use SQL aggregations — no Python loops over individual rows.
Expensive calculations are cached with TTL via the project's cache layer.
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, time as dt_time, timedelta
from typing import List, Optional

from sqlalchemy import cast, func, Date, Float, Integer, case, extract, text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.cache import (
    CACHE_TTL,
    cache_get,
    cache_set,
    cached,
)
from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile

logger = logging.getLogger(__name__)

# ─── Cache TTL for analytics (seconds) ──────────────────────────────────────

_ANALYTICS_TTL = 300       # 5 min — per-user analytics
_TRENDS_TTL = 600          # 10 min — weekly/monthly trends
_RANKING_TTL = 900         # 15 min — most-eaten foods


# ─── Insight data class ──────────────────────────────────────────────────────


class Insight:
    def __init__(self, type: str, icon: str, message: str, priority: int):
        self.type = type
        self.icon = icon
        self.message = message
        self.priority = priority

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "icon": self.icon,
            "message": self.message,
            "priority": self.priority,
        }


# ─── Target helpers ──────────────────────────────────────────────────────────


async def _get_targets(user_id: int, session: AsyncSession) -> dict:
    """Fetch calorie/macro targets from nutrition profile or onboarding."""
    result = await session.execute(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if profile:
        return {
            "target_calories": profile.target_calories,
            "target_protein_g": profile.target_protein_g,
            "target_carbs_g": profile.target_carbs_g,
            "target_fat_g": profile.target_fat_g,
        }

    # Fallback to onboarding profile
    result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.scalar_one_or_none()

    if onboarding:
        return {
            "target_calories": getattr(onboarding, "daily_calories", 2000) or 2000,
            "target_protein_g": getattr(onboarding, "daily_protein_g", 150) or 150,
            "target_carbs_g": getattr(onboarding, "daily_carbs_g", 250) or 250,
            "target_fat_g": getattr(onboarding, "daily_fats_g", 65) or 65,
        }

    return {
        "target_calories": 2000,
        "target_protein_g": 150,
        "target_carbs_g": 250,
        "target_fat_g": 65,
    }


async def _get_today_totals(user_id: int, today: date, session: AsyncSession) -> dict:
    """Aggregate today's food log totals via a single SQL query."""
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("total_calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("total_protein_g"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0).label("total_carbs_g"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0).label("total_fats_g"),
            func.count(AIFoodLog.id).label("meals_logged"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    row = result.first()
    return {
        "total_calories": float(row.total_calories) if row else 0,
        "total_protein_g": float(row.total_protein_g) if row else 0,
        "total_carbs_g": float(row.total_carbs_g) if row else 0,
        "total_fats_g": float(row.total_fats_g) if row else 0,
        "meals_logged": int(row.meals_logged) if row else 0,
    }


async def _get_water_ml(user_id: int, today: date, session: AsyncSession) -> float:
    """Get today's water intake from daily nutrition summary."""
    result = await session.execute(
        select(DailyNutritionSummary.water_ml).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == today,
        )
    )
    row = result.scalar_one_or_none()
    return float(row) if row else 0.0


async def _get_streak(user_id: int, today: date, session: AsyncSession) -> int:
    """Reuse the streak calculation from ai_scan_service."""
    from .ai_scan_service import _calculate_streak
    return await _calculate_streak(user_id, today, session)


# ─── Daily insights (existing, improved) ────────────────────────────────────


async def get_daily_insights(user_id: int, session: AsyncSession) -> List[dict]:
    """Generate 3-5 personalized insights based on real user data for today."""
    today = date.today()

    targets = await _get_targets(user_id, session)
    totals = await _get_today_totals(user_id, today, session)
    water_ml = await _get_water_ml(user_id, today, session)
    streak = await _get_streak(user_id, today, session)

    insights: List[Insight] = []

    # 1. No food logged today
    if totals["meals_logged"] == 0:
        insights.append(Insight(
            type="no_food",
            icon="restaurant",
            message="Aun no registras comida hoy. Empieza con el desayuno!",
            priority=1,
        ))

    # 2. Protein below 80% of target
    target_protein = targets["target_protein_g"]
    if totals["meals_logged"] > 0 and target_protein > 0:
        protein_ratio = totals["total_protein_g"] / target_protein
        if protein_ratio < 0.8:
            current_g = round(totals["total_protein_g"], 1)
            insights.append(Insight(
                type="low_protein",
                icon="fitness-center",
                message=f"Tu proteina esta baja hoy ({current_g}g de {round(target_protein)}g). Agrega pollo o huevos.",
                priority=2,
            ))

    # 3. Calories over 110% of target
    target_calories = targets["target_calories"]
    if totals["meals_logged"] > 0 and target_calories > 0:
        calorie_ratio = totals["total_calories"] / target_calories
        if calorie_ratio > 1.1:
            current_cal = round(totals["total_calories"])
            insights.append(Insight(
                type="high_calories",
                icon="warning",
                message=f"Cuidado, estas sobre tu meta de calorias ({current_cal} de {round(target_calories)} kcal).",
                priority=2,
            ))

    # 4. Low water intake
    if water_ml < 1500:
        water_display = round(water_ml)
        insights.append(Insight(
            type="low_water",
            icon="water-drop",
            message=f"Recuerda hidratarte! Llevas solo {water_display}ml de agua.",
            priority=3,
        ))

    # 5. Streak celebration
    if streak > 7:
        insights.append(Insight(
            type="streak",
            icon="local-fire-department",
            message=f"Increible! Llevas {streak} dias seguidos. Sigue asi!",
            priority=4,
        ))

    # Sort by priority and return 3-5 insights
    insights.sort(key=lambda i: i.priority)
    return [i.to_dict() for i in insights[:5]]


# ─── Weekly / Monthly calorie trends ────────────────────────────────────────


async def get_calorie_trends(
    user_id: int,
    session: AsyncSession,
    days: int = 30,
) -> dict:
    """
    Calculate calorie intake trends over the last N days.

    Uses SQL aggregation to compute:
    - Daily totals grouped by date
    - Linear regression slope (trend direction) via SQL
    - Week-over-week change percentage
    - Average daily intake

    Returns:
        {
            "period_days": 30,
            "daily_totals": [{"date": "2026-03-01", "calories": 1850}, ...],
            "avg_daily_calories": 1920.5,
            "trend_direction": "decreasing" | "increasing" | "stable",
            "trend_slope_per_day": -12.3,  # kcal change per day
            "week_over_week_change_pct": -3.2,
            "current_week_avg": 1870.0,
            "previous_week_avg": 1930.0,
        }
    """
    cache_key = f"user:{user_id}:calorie_trends:{days}"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return cached_val

    cutoff = date.today() - timedelta(days=days)
    today = date.today()

    # --- Daily totals via SQL aggregation ---
    log_date_col = cast(AIFoodLog.logged_at, Date)

    daily_q = (
        select(
            log_date_col.label("log_date"),
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("total_cal"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            log_date_col >= cutoff,
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(log_date_col)
        .order_by(log_date_col)
    )
    daily_result = await session.execute(daily_q)
    daily_rows = daily_result.all()

    daily_totals = [
        {"date": str(row.log_date), "calories": round(float(row.total_cal), 1)}
        for row in daily_rows
    ]

    if not daily_rows:
        result = {
            "period_days": days,
            "daily_totals": [],
            "avg_daily_calories": 0.0,
            "trend_direction": "stable",
            "trend_slope_per_day": 0.0,
            "week_over_week_change_pct": 0.0,
            "current_week_avg": 0.0,
            "previous_week_avg": 0.0,
        }
        await cache_set(cache_key, result, _TRENDS_TTL)
        return result

    # --- Average daily calories ---
    total_sum = sum(row.total_cal for row in daily_rows)
    num_days_with_data = len(daily_rows)
    avg_daily = round(float(total_sum) / num_days_with_data, 1) if num_days_with_data else 0.0

    # --- Linear regression slope via SQL ---
    # Slope = (N * SUM(x*y) - SUM(x)*SUM(y)) / (N * SUM(x^2) - SUM(x)^2)
    # Where x = day_number (0..N-1), y = daily calories
    day_num = func.extract("epoch", log_date_col - cutoff) / 86400.0
    n_col = func.count()
    sum_x = func.sum(day_num)
    sum_y = func.sum(AIFoodLog.calories)
    sum_xy = func.sum(day_num * AIFoodLog.calories)
    sum_x2 = func.sum(day_num * day_num)

    # We need to first aggregate by day, then compute regression
    # Use a subquery for daily totals, then regression over them
    daily_sub = (
        select(
            log_date_col.label("log_date"),
            func.sum(AIFoodLog.calories).label("day_cal"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            log_date_col >= cutoff,
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(log_date_col)
        .subquery()
    )

    day_num_sub = func.extract("epoch", daily_sub.c.log_date - cutoff) / 86400.0

    slope_q = select(
        func.count().label("n"),
        func.sum(day_num_sub).label("sx"),
        func.sum(daily_sub.c.day_cal).label("sy"),
        func.sum(day_num_sub * daily_sub.c.day_cal).label("sxy"),
        func.sum(day_num_sub * day_num_sub).label("sx2"),
    ).select_from(daily_sub)

    slope_result = await session.execute(slope_q)
    sr = slope_result.first()

    trend_slope = 0.0
    if sr and sr.n and sr.n > 1:
        n = float(sr.n)
        sx = float(sr.sx or 0)
        sy = float(sr.sy or 0)
        sxy = float(sr.sxy or 0)
        sx2 = float(sr.sx2 or 0)
        denom = n * sx2 - sx * sx
        if abs(denom) > 1e-9:
            trend_slope = round((n * sxy - sx * sy) / denom, 2)

    # --- Trend direction ---
    if abs(trend_slope) < 5:
        trend_direction = "stable"
    elif trend_slope > 0:
        trend_direction = "increasing"
    else:
        trend_direction = "decreasing"

    # --- Week-over-week comparison ---
    week_boundary = today - timedelta(days=7)
    prev_week_boundary = today - timedelta(days=14)

    current_week_q = (
        select(func.avg(daily_sub.c.day_cal))
        .where(daily_sub.c.log_date >= week_boundary)
    )
    prev_week_q = (
        select(func.avg(daily_sub.c.day_cal))
        .where(
            daily_sub.c.log_date >= prev_week_boundary,
            daily_sub.c.log_date < week_boundary,
        )
    )

    cw_result = await session.execute(current_week_q)
    pw_result = await session.execute(prev_week_q)

    current_week_avg = round(float(cw_result.scalar() or 0), 1)
    previous_week_avg = round(float(pw_result.scalar() or 0), 1)

    wow_change_pct = 0.0
    if previous_week_avg > 0:
        wow_change_pct = round(
            ((current_week_avg - previous_week_avg) / previous_week_avg) * 100, 1
        )

    result = {
        "period_days": days,
        "daily_totals": daily_totals,
        "avg_daily_calories": avg_daily,
        "trend_direction": trend_direction,
        "trend_slope_per_day": trend_slope,
        "week_over_week_change_pct": wow_change_pct,
        "current_week_avg": current_week_avg,
        "previous_week_avg": previous_week_avg,
    }
    await cache_set(cache_key, result, _TRENDS_TTL)
    return result


# ─── Macro balance scoring ──────────────────────────────────────────────────


async def get_macro_balance_score(
    user_id: int,
    session: AsyncSession,
    days: int = 7,
) -> dict:
    """
    Score how well the user hits their macro targets over the last N days.

    For each macro (protein, carbs, fat), computes:
    - Average daily intake
    - Target
    - Adherence ratio (avg / target, clamped 0..2)
    - Penalty score: |1 - ratio| * 100 (0 = perfect, 100 = missed completely)

    Overall score = 100 - average of per-macro penalties.

    All computation done in SQL.
    """
    cache_key = f"user:{user_id}:macro_balance:{days}"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return cached_val

    targets = await _get_targets(user_id, session)
    cutoff = date.today() - timedelta(days=days)
    log_date_col = cast(AIFoodLog.logged_at, Date)

    # Aggregate by day first, then average across days
    daily_sub = (
        select(
            log_date_col.label("log_date"),
            func.sum(AIFoodLog.protein_g).label("protein"),
            func.sum(AIFoodLog.carbs_g).label("carbs"),
            func.sum(AIFoodLog.fats_g).label("fats"),
            func.sum(AIFoodLog.calories).label("calories"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            log_date_col >= cutoff,
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(log_date_col)
        .subquery()
    )

    avg_q = select(
        func.avg(daily_sub.c.protein).label("avg_protein"),
        func.avg(daily_sub.c.carbs).label("avg_carbs"),
        func.avg(daily_sub.c.fats).label("avg_fats"),
        func.avg(daily_sub.c.calories).label("avg_calories"),
        func.count().label("days_with_data"),
    )

    result = await session.execute(avg_q)
    row = result.first()

    if not row or not row.days_with_data:
        empty = {
            "period_days": days,
            "days_with_data": 0,
            "overall_score": 0,
            "macros": {},
        }
        await cache_set(cache_key, empty, _ANALYTICS_TTL)
        return empty

    macros = {}
    penalties = []

    for macro_name, avg_val, target_val in [
        ("protein", float(row.avg_protein or 0), targets["target_protein_g"]),
        ("carbs", float(row.avg_carbs or 0), targets["target_carbs_g"]),
        ("fat", float(row.avg_fats or 0), targets["target_fat_g"]),
        ("calories", float(row.avg_calories or 0), targets["target_calories"]),
    ]:
        if target_val > 0:
            ratio = avg_val / target_val
            # Penalty = how far from perfect (1.0)
            penalty = abs(1.0 - ratio) * 100
            penalty = min(penalty, 100.0)
        else:
            ratio = 0.0
            penalty = 100.0

        macros[macro_name] = {
            "avg_daily": round(avg_val, 1),
            "target": round(target_val, 1),
            "adherence_ratio": round(ratio, 3),
            "penalty": round(penalty, 1),
            "status": _macro_status(ratio),
        }
        penalties.append(penalty)

    overall_score = round(100 - (sum(penalties) / len(penalties)), 1) if penalties else 0
    overall_score = max(0, min(100, overall_score))

    result_dict = {
        "period_days": days,
        "days_with_data": int(row.days_with_data),
        "overall_score": overall_score,
        "macros": macros,
    }
    await cache_set(cache_key, result_dict, _ANALYTICS_TTL)
    return result_dict


def _macro_status(ratio: float) -> str:
    """Classify macro adherence into human-readable status."""
    if ratio < 0.5:
        return "very_low"
    elif ratio < 0.8:
        return "low"
    elif ratio <= 1.1:
        return "on_target"
    elif ratio <= 1.3:
        return "slightly_high"
    else:
        return "high"


# ─── Streak statistics ──────────────────────────────────────────────────────


async def get_streak_statistics(
    user_id: int,
    session: AsyncSession,
) -> dict:
    """
    Compute streak statistics using SQL window functions:
    - current_streak: consecutive days ending today/yesterday with food logs
    - longest_streak: longest consecutive run ever
    - total_days_logged: total unique days with at least one log
    - first_log_date / last_log_date

    Uses a single SQL query with window functions (date - row_number groups
    consecutive dates into the same partition).
    """
    cache_key = f"user:{user_id}:streak_stats"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return cached_val

    today = date.today()

    # Pure SQL approach: get distinct log dates, compute streaks
    streak_sql = sa_text("""
        WITH dated AS (
            SELECT DISTINCT DATE(logged_at) AS log_date
            FROM ai_food_log
            WHERE user_id = :user_id
              AND deleted_at IS NULL
        ),
        grouped AS (
            SELECT
                log_date,
                log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
            FROM dated
        ),
        streaks AS (
            SELECT
                grp,
                COUNT(*) AS streak_len,
                MIN(log_date) AS streak_start,
                MAX(log_date) AS streak_end
            FROM grouped
            GROUP BY grp
        )
        SELECT
            (SELECT COUNT(*) FROM dated) AS total_days_logged,
            (SELECT MIN(log_date) FROM dated) AS first_log_date,
            (SELECT MAX(log_date) FROM dated) AS last_log_date,
            (SELECT MAX(streak_len) FROM streaks) AS longest_streak,
            (SELECT streak_len FROM streaks
             WHERE streak_end >= :yesterday
             ORDER BY streak_end DESC LIMIT 1) AS current_streak
    """)

    result = await session.execute(
        streak_sql,
        {"user_id": user_id, "yesterday": today - timedelta(days=1)},
    )
    row = result.first()

    if not row or not row.total_days_logged:
        empty = {
            "current_streak": 0,
            "longest_streak": 0,
            "total_days_logged": 0,
            "first_log_date": None,
            "last_log_date": None,
            "days_since_first_log": 0,
            "logging_rate_pct": 0.0,
        }
        await cache_set(cache_key, empty, CACHE_TTL.get("streak", 60))
        return empty

    total_days = int(row.total_days_logged)
    first_log = row.first_log_date
    last_log = row.last_log_date
    days_since_first = (today - first_log).days + 1 if first_log else 0
    logging_rate = round((total_days / days_since_first) * 100, 1) if days_since_first > 0 else 0.0

    result_dict = {
        "current_streak": int(row.current_streak or 0),
        "longest_streak": int(row.longest_streak or 0),
        "total_days_logged": total_days,
        "first_log_date": str(first_log) if first_log else None,
        "last_log_date": str(last_log) if last_log else None,
        "days_since_first_log": days_since_first,
        "logging_rate_pct": logging_rate,
    }
    await cache_set(cache_key, result_dict, CACHE_TTL.get("streak", 60))
    return result_dict


# ─── Most-eaten foods ranking ───────────────────────────────────────────────


async def get_most_eaten_foods(
    user_id: int,
    session: AsyncSession,
    days: int = 30,
    limit: int = 10,
) -> dict:
    """
    Rank the user's most frequently eaten foods over the last N days.

    SQL GROUP BY on food_name with count, avg calories, and total calories.
    """
    cache_key = f"user:{user_id}:top_foods:{days}:{limit}"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return cached_val

    cutoff = date.today() - timedelta(days=days)

    ranking_q = (
        select(
            AIFoodLog.food_name,
            func.count(AIFoodLog.id).label("times_eaten"),
            func.round(cast(func.avg(AIFoodLog.calories), Float), 1).label("avg_calories"),
            func.round(cast(func.sum(AIFoodLog.calories), Float), 1).label("total_calories"),
            func.round(cast(func.avg(AIFoodLog.protein_g), Float), 1).label("avg_protein_g"),
            # Most common meal_type for this food
            func.mode().within_group(AIFoodLog.meal_type).label("typical_meal_type"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= datetime.combine(cutoff, dt_time.min),
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(AIFoodLog.food_name)
        .order_by(func.count(AIFoodLog.id).desc())
        .limit(limit)
    )

    result = await session.execute(ranking_q)
    rows = result.all()

    foods = []
    for rank, row in enumerate(rows, start=1):
        foods.append({
            "rank": rank,
            "food_name": row.food_name,
            "times_eaten": int(row.times_eaten),
            "avg_calories": float(row.avg_calories or 0),
            "total_calories": float(row.total_calories or 0),
            "avg_protein_g": float(row.avg_protein_g or 0),
            "typical_meal_type": row.typical_meal_type,
        })

    result_dict = {
        "period_days": days,
        "top_foods": foods,
        "unique_foods_count": len(foods),
    }
    await cache_set(cache_key, result_dict, _RANKING_TTL)
    return result_dict


# ─── Meal timing analysis ───────────────────────────────────────────────────


async def get_meal_timing_analysis(
    user_id: int,
    session: AsyncSession,
    days: int = 30,
) -> dict:
    """
    Analyze when the user typically eats each meal type.

    For each meal_type, computes:
    - avg_hour: average hour of the day (0-23)
    - typical_time: human-readable time like "12:30"
    - count: how many times logged
    - calorie distribution by meal type

    Uses SQL EXTRACT(hour) and EXTRACT(minute) aggregation.
    """
    cache_key = f"user:{user_id}:meal_timing:{days}"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return cached_val

    cutoff = date.today() - timedelta(days=days)

    timing_q = (
        select(
            AIFoodLog.meal_type,
            func.count(AIFoodLog.id).label("count"),
            func.avg(extract("hour", AIFoodLog.logged_at)).label("avg_hour"),
            func.avg(extract("minute", AIFoodLog.logged_at)).label("avg_minute"),
            func.round(cast(func.avg(AIFoodLog.calories), Float), 1).label("avg_calories"),
            func.round(cast(func.sum(AIFoodLog.calories), Float), 1).label("total_calories"),
            func.min(AIFoodLog.logged_at).label("earliest_log"),
            func.max(AIFoodLog.logged_at).label("latest_log"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= datetime.combine(cutoff, dt_time.min),
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(AIFoodLog.meal_type)
        .order_by(func.avg(extract("hour", AIFoodLog.logged_at)))
    )

    result = await session.execute(timing_q)
    rows = result.all()

    total_meals = sum(int(r.count) for r in rows)
    total_calories = sum(float(r.total_calories or 0) for r in rows)

    meal_timings = []
    for row in rows:
        avg_h = float(row.avg_hour or 0)
        avg_m = float(row.avg_minute or 0)
        h_int = int(avg_h)
        m_int = int(avg_m)
        meal_cal = float(row.total_calories or 0)
        cal_pct = round((meal_cal / total_calories) * 100, 1) if total_calories > 0 else 0.0

        meal_timings.append({
            "meal_type": row.meal_type,
            "count": int(row.count),
            "avg_hour": round(avg_h, 1),
            "typical_time": f"{h_int:02d}:{m_int:02d}",
            "avg_calories_per_meal": float(row.avg_calories or 0),
            "total_calories": meal_cal,
            "calorie_share_pct": cal_pct,
        })

    # Compute eating window (hours between earliest and latest avg meal)
    eating_window_hours = 0.0
    if len(meal_timings) >= 2:
        hours = [mt["avg_hour"] for mt in meal_timings]
        eating_window_hours = round(max(hours) - min(hours), 1)

    result_dict = {
        "period_days": days,
        "total_meals": total_meals,
        "meal_timings": meal_timings,
        "eating_window_hours": eating_window_hours,
    }
    await cache_set(cache_key, result_dict, _ANALYTICS_TTL)
    return result_dict


# ─── Calorie consistency score ──────────────────────────────────────────────


async def get_calorie_consistency(
    user_id: int,
    session: AsyncSession,
    days: int = 14,
) -> dict:
    """
    Measure how consistent the user's daily calorie intake is.

    Uses the coefficient of variation (CV = stddev / mean * 100).
    Lower CV = more consistent. A CV < 15% is considered good.

    All computed in SQL via stddev_samp and avg.
    """
    cache_key = f"user:{user_id}:calorie_consistency:{days}"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return cached_val

    cutoff = date.today() - timedelta(days=days)
    log_date_col = cast(AIFoodLog.logged_at, Date)

    # Subquery: daily totals
    daily_sub = (
        select(
            log_date_col.label("log_date"),
            func.sum(AIFoodLog.calories).label("day_cal"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            log_date_col >= cutoff,
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(log_date_col)
        .subquery()
    )

    stats_q = select(
        func.count().label("n"),
        func.avg(daily_sub.c.day_cal).label("mean_cal"),
        func.coalesce(func.stddev_samp(daily_sub.c.day_cal), 0).label("stddev_cal"),
        func.min(daily_sub.c.day_cal).label("min_cal"),
        func.max(daily_sub.c.day_cal).label("max_cal"),
    )

    result = await session.execute(stats_q)
    row = result.first()

    if not row or not row.n or row.n < 2:
        empty = {
            "period_days": days,
            "days_with_data": int(row.n) if row and row.n else 0,
            "consistency_score": 0,
            "cv_pct": 0.0,
            "mean_calories": 0.0,
            "stddev_calories": 0.0,
            "min_daily": 0.0,
            "max_daily": 0.0,
            "range": 0.0,
            "rating": "insufficient_data",
        }
        await cache_set(cache_key, empty, _ANALYTICS_TTL)
        return empty

    mean_cal = float(row.mean_cal or 0)
    stddev_cal = float(row.stddev_cal or 0)
    cv_pct = round((stddev_cal / mean_cal) * 100, 1) if mean_cal > 0 else 0.0

    # Consistency score: 100 - CV (clamped 0-100)
    consistency_score = round(max(0, min(100, 100 - cv_pct)))

    # Rating
    if cv_pct < 10:
        rating = "excellent"
    elif cv_pct < 15:
        rating = "good"
    elif cv_pct < 25:
        rating = "moderate"
    elif cv_pct < 40:
        rating = "inconsistent"
    else:
        rating = "very_inconsistent"

    result_dict = {
        "period_days": days,
        "days_with_data": int(row.n),
        "consistency_score": consistency_score,
        "cv_pct": cv_pct,
        "mean_calories": round(mean_cal, 1),
        "stddev_calories": round(stddev_cal, 1),
        "min_daily": round(float(row.min_cal or 0), 1),
        "max_daily": round(float(row.max_cal or 0), 1),
        "range": round(float(row.max_cal or 0) - float(row.min_cal or 0), 1),
        "rating": rating,
    }
    await cache_set(cache_key, result_dict, _ANALYTICS_TTL)
    return result_dict


# ─── Progress toward goal ───────────────────────────────────────────────────


async def get_goal_progress(
    user_id: int,
    session: AsyncSession,
) -> dict:
    """
    Calculate progress toward the user's weight/nutrition goal.

    Compares:
    - Current average calorie intake vs target
    - Projected weight change rate based on calorie surplus/deficit
    - Days until goal weight at current rate

    Uses data from onboarding profile (goal, target weight, speed) and
    recent food logs.
    """
    cache_key = f"user:{user_id}:goal_progress"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return cached_val

    # Get onboarding profile for goal context
    ob_result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = ob_result.scalar_one_or_none()

    targets = await _get_targets(user_id, session)

    # Get average daily calories over last 14 days
    cutoff_14d = date.today() - timedelta(days=14)
    log_date_col = cast(AIFoodLog.logged_at, Date)

    daily_sub = (
        select(
            log_date_col.label("log_date"),
            func.sum(AIFoodLog.calories).label("day_cal"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            log_date_col >= cutoff_14d,
        )
        .group_by(log_date_col)
        .subquery()
    )

    avg_result = await session.execute(
        select(
            func.avg(daily_sub.c.day_cal).label("avg_cal"),
            func.count().label("days"),
        )
    )
    avg_row = avg_result.first()

    avg_daily_cal = float(avg_row.avg_cal) if avg_row and avg_row.avg_cal else 0.0
    days_with_data = int(avg_row.days) if avg_row and avg_row.days else 0

    target_cal = targets["target_calories"]
    daily_surplus_deficit = round(avg_daily_cal - target_cal, 1) if target_cal else 0.0

    # Estimate weight change rate
    # ~7700 kcal = 1 kg of body weight change
    KCAL_PER_KG = 7700.0
    weekly_cal_diff = daily_surplus_deficit * 7
    estimated_weekly_kg_change = round(weekly_cal_diff / KCAL_PER_KG, 3)

    goal = getattr(onboarding, "goal", None) if onboarding else None
    current_weight = getattr(onboarding, "weight_kg", None) if onboarding else None
    target_weight = getattr(onboarding, "target_weight_kg", None) if onboarding else None
    target_speed_kg = getattr(onboarding, "weekly_speed_kg", 0.8) if onboarding else 0.8

    # Compute days to goal
    days_to_goal: Optional[int] = None
    on_track = False

    if current_weight and target_weight and goal:
        weight_diff = abs(current_weight - target_weight)

        if goal == "lose" and estimated_weekly_kg_change < 0:
            weeks_needed = weight_diff / abs(estimated_weekly_kg_change)
            days_to_goal = round(weeks_needed * 7)
            on_track = abs(estimated_weekly_kg_change) >= (target_speed_kg * 0.7)
        elif goal == "gain" and estimated_weekly_kg_change > 0:
            weeks_needed = weight_diff / estimated_weekly_kg_change
            days_to_goal = round(weeks_needed * 7)
            on_track = estimated_weekly_kg_change >= (target_speed_kg * 0.7)
        elif goal == "maintain":
            on_track = abs(daily_surplus_deficit) < (target_cal * 0.1) if target_cal else False

    # Adherence percentage (how close to target)
    adherence_pct = 0.0
    if target_cal > 0 and avg_daily_cal > 0:
        ratio = avg_daily_cal / target_cal
        adherence_pct = round(max(0, 100 - abs(1 - ratio) * 100), 1)

    result_dict = {
        "goal": goal,
        "current_weight_kg": current_weight,
        "target_weight_kg": target_weight,
        "target_speed_kg_per_week": target_speed_kg,
        "avg_daily_calories_14d": round(avg_daily_cal, 1),
        "target_daily_calories": round(target_cal, 1),
        "daily_surplus_deficit_kcal": daily_surplus_deficit,
        "estimated_weekly_kg_change": estimated_weekly_kg_change,
        "days_to_goal": days_to_goal,
        "on_track": on_track,
        "calorie_adherence_pct": adherence_pct,
        "days_with_data": days_with_data,
    }
    await cache_set(cache_key, result_dict, _ANALYTICS_TTL)
    return result_dict


# ─── Full user analytics bundle ─────────────────────────────────────────────


async def get_full_user_analytics(
    user_id: int,
    session: AsyncSession,
) -> dict:
    """
    Bundle all per-user analytics into a single response.
    This is the main endpoint the mobile app calls for the analytics/stats tab.

    Each sub-function handles its own caching individually, so partial
    cache hits still save work.
    """
    calorie_trends = await get_calorie_trends(user_id, session, days=30)
    macro_balance = await get_macro_balance_score(user_id, session, days=7)
    streak_stats = await get_streak_statistics(user_id, session)
    top_foods = await get_most_eaten_foods(user_id, session, days=30, limit=10)
    meal_timing = await get_meal_timing_analysis(user_id, session, days=30)
    consistency = await get_calorie_consistency(user_id, session, days=14)
    goal_progress = await get_goal_progress(user_id, session)
    insights = await get_daily_insights(user_id, session)

    return {
        "user_id": user_id,
        "generated_at": datetime.utcnow().isoformat(),
        "calorie_trends": calorie_trends,
        "macro_balance": macro_balance,
        "streak_statistics": streak_stats,
        "top_foods": top_foods,
        "meal_timing": meal_timing,
        "calorie_consistency": consistency,
        "goal_progress": goal_progress,
        "daily_insights": insights,
    }
