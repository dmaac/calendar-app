"""
Nutrition Risk Engine v2 — Rule-based adherence and risk scoring.

All logic is pure Python/SQL. No AI API calls.

Calculates:
- Daily adherence (calories, macros, meals) against the user's plan
- Daily confidence score (0-100) — reliability of the logged data
- Diet quality score (0-100) — composite of calorie compliance, protein, meal distribution, macro balance, hydration
- Nutrition risk score (0-100) — composite of no-log streaks, caloric deviation, macro non-compliance, diet quality
- Adherence status labels and automatic intervention suggestions
- Primary and secondary risk reasons for intervention tracking
"""

from __future__ import annotations

import hashlib
import logging
import math
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Intervention definitions (Item 36 — severity-specific message templates)
# ---------------------------------------------------------------------------

INTERVENTIONS: dict[str, dict] = {
    "critical": {
        "push_title": "Te extrañamos!",
        "push_body": "Llevas {days} dias sin registrar. Tu plan te espera.",
        "home_banner": True,
        "coach_message": "Entiendo que ha sido dificil. Empecemos con una comida simple hoy.",
        "simplify_ui": True,
        "color": "#DC2626",
    },
    "high_risk": {
        "push_title": "Tu plan necesita atencion",
        "push_body": "Estas por debajo del {pct}% de tu meta. Una comida alta en proteina ayudaria.",
        "home_banner": True,
        "suggestions": ["desayuno_proteico", "snack_rapido"],
        "color": "#EF4444",
    },
    "risk": {
        "push_title": "Puedes mejorar hoy",
        "push_body": "Llevas {cal} de {target} kcal. Agrega una comida mas.",
        "home_banner": False,
        "color": "#F59E0B",
    },
    "low_adherence": {
        "push_title": "Vas por buen camino",
        "push_body": "Llevas {cal} de {target} kcal. Un poco mas y llegas a tu meta.",
        "home_banner": False,
        "color": "#FB923C",
    },
    "moderate_excess": {
        "push_title": "Cuidado con el exceso",
        "push_body": "Llevas {cal} kcal — un {pct}% sobre tu meta. Modera la siguiente comida.",
        "home_banner": False,
        "color": "#F59E0B",
    },
    "high_excess": {
        "push_title": "Exceso importante",
        "push_body": "Llevas {cal} kcal — muy por encima de tu meta de {target}. Considera una comida ligera.",
        "home_banner": True,
        "color": "#EF4444",
    },
    "at_risk_but_improving": {
        "push_title": "Vas mejorando!",
        "push_body": "Tu tendencia es positiva. Sigue asi, cada dia cuenta.",
        "home_banner": False,
        "coach_message": "Buen trabajo, se nota la mejora. Mantengamos el ritmo.",
        "color": "#FBBF24",
    },
    "optimal": {
        "color": "#22C55E",
    },
}

# Cause-specific message templates (Item 36)
CAUSE_MESSAGES: dict[str, list[dict]] = {
    "no_log": [
        {
            "push_title": "No has registrado hoy",
            "push_body": "Solo toma 10 segundos. Saca una foto a tu comida.",
        },
        {
            "push_title": "Tu diario esta vacio hoy",
            "push_body": "Registrar te ayuda a cumplir tu meta. Empieza ahora.",
        },
        {
            "push_title": "Aun no registras nada",
            "push_body": "Un registro rapido mantiene tu racha. Animate!",
        },
    ],
    "low_calories": [
        {
            "push_title": "Estas comiendo muy poco",
            "push_body": "Llevas {cal} de {target} kcal. Tu cuerpo necesita energia.",
        },
        {
            "push_title": "Calorias bajas hoy",
            "push_body": "Solo {cal} kcal registradas. Agrega un snack nutritivo.",
        },
        {
            "push_title": "Tu ingesta esta baja",
            "push_body": "{cal} de {target} kcal. Considera una comida mas completa.",
        },
    ],
    "excess": [
        {
            "push_title": "Cuidado con el exceso",
            "push_body": "Llevas {cal} kcal, un {pct}% sobre tu meta. Modera lo siguiente.",
        },
        {
            "push_title": "Te pasaste un poco hoy",
            "push_body": "{cal} kcal — por encima de tu meta de {target}. Elige algo ligero.",
        },
        {
            "push_title": "Exceso calorico",
            "push_body": "Vas en {cal} de {target} kcal. Una caminata corta puede ayudar.",
        },
    ],
    "bad_quality": [
        {
            "push_title": "Mejora la calidad de tu dieta",
            "push_body": "Intenta agregar mas variedad y alimentos integrales.",
        },
        {
            "push_title": "Tu dieta puede mejorar",
            "push_body": "Agrega verduras o frutas a tu proxima comida.",
        },
        {
            "push_title": "Calidad nutricional baja",
            "push_body": "Diversifica tus comidas para mejorar tu nutricion.",
        },
    ],
    "low_protein": [
        {
            "push_title": "Te falta proteina",
            "push_body": "Solo llevas {protein_pct}% de tu meta de proteina. Agrega huevo, pollo o legumbres.",
        },
        {
            "push_title": "Proteina insuficiente hoy",
            "push_body": "Tu proteina esta baja. Considera un snack alto en proteina.",
        },
        {
            "push_title": "Sube tu proteina",
            "push_body": "Necesitas mas proteina. Un yogurt griego o frutos secos ayudan.",
        },
    ],
    "macro_imbalance": [
        {
            "push_title": "Desbalance de macros",
            "push_body": "Un solo macronutriente domina tu dieta hoy. Busca equilibrio.",
        },
        {
            "push_title": "Balancea tus macros",
            "push_body": "Incluye proteina, carbos y grasas saludables en tu proxima comida.",
        },
        {
            "push_title": "Macros desbalanceados",
            "push_body": "Diversifica para un mejor equilibrio nutricional.",
        },
    ],
}

# In-memory cooldown tracker (per-process; sufficient for single-instance deployments)
# Key: "{user_id}:{severity}" -> datetime of last intervention
_intervention_cooldowns: dict[str, datetime] = {}


# ---------------------------------------------------------------------------
# Goal helpers
# ---------------------------------------------------------------------------

async def _get_goals(user_id: int, session: AsyncSession) -> dict:
    """
    Retrieve the user's daily macro goals.
    Priority: UserNutritionProfile > OnboardingProfile > sensible defaults.
    """
    result = await session.exec(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.first()
    if profile is not None:
        return {
            "calories": int(profile.target_calories),
            "protein_g": int(profile.target_protein_g),
            "fat_g": int(profile.target_fat_g),
            "carbs_g": int(profile.target_carbs_g),
        }

    result = await session.exec(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.first()
    if onboarding is not None and onboarding.daily_calories is not None:
        return {
            "calories": int(onboarding.daily_calories),
            "protein_g": int(onboarding.daily_protein_g or 150),
            "fat_g": int(onboarding.daily_fats_g or 65),
            "carbs_g": int(onboarding.daily_carbs_g or 250),
        }

    return {"calories": 2000, "protein_g": 150, "fat_g": 65, "carbs_g": 250}


# ---------------------------------------------------------------------------
# Goal-based thresholds (Item 17)
# ---------------------------------------------------------------------------

GOAL_THRESHOLDS: dict[str, dict[str, float]] = {
    "lose_weight": {
        "optimal_low": 0.90,
        "optimal_high": 1.10,
        "low_adherence_floor": 0.70,
        "risk_floor": 0.50,
        "high_risk_floor": 0.25,
        "moderate_excess_ceil": 1.20,
        "high_excess_ceil": 1.40,
    },
    "maintain": {
        "optimal_low": 0.85,
        "optimal_high": 1.15,
        "low_adherence_floor": 0.70,
        "risk_floor": 0.50,
        "high_risk_floor": 0.25,
        "moderate_excess_ceil": 1.30,
        "high_excess_ceil": 1.60,
    },
    "gain_muscle": {
        "optimal_low": 0.95,
        "optimal_high": 1.30,
        "low_adherence_floor": 0.75,
        "risk_floor": 0.55,
        "high_risk_floor": 0.30,
        "moderate_excess_ceil": 1.45,
        "high_excess_ceil": 1.70,
    },
}


async def _get_user_goal(user_id: int, session: AsyncSession) -> str:
    """Return the user's goal string (lose_weight / maintain / gain_muscle)."""
    result = await session.exec(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.first()
    if profile is not None and profile.goal:
        return profile.goal.value if hasattr(profile.goal, "value") else str(profile.goal)

    result = await session.exec(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.first()
    if onboarding is not None and onboarding.goal:
        return str(onboarding.goal)

    return "maintain"


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

async def _get_day_totals(user_id: int, target_date: date, session: AsyncSession) -> dict:
    """Aggregate food log totals for a specific date."""
    day_start = datetime.combine(target_date, dt_time.min)
    day_end = datetime.combine(target_date, dt_time.max)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0.0).label("calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0.0).label("protein_g"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0.0).label("fat_g"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0.0).label("carbs_g"),
            func.count(AIFoodLog.id).label("meal_count"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
        )
    )
    row = result.one()
    return {
        "calories": float(row.calories),
        "protein_g": float(row.protein_g),
        "fat_g": float(row.fat_g),
        "carbs_g": float(row.carbs_g),
        "meal_count": int(row.meal_count),
    }


async def _get_distinct_meals_count(user_id: int, target_date: date, session: AsyncSession) -> int:
    """Count distinct meal types logged on a date (breakfast, lunch, dinner, snack)."""
    day_start = datetime.combine(target_date, dt_time.min)
    day_end = datetime.combine(target_date, dt_time.max)

    result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.meal_type))).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
        )
    )
    return result.scalar() or 0


async def _get_meal_hours(user_id: int, target_date: date, session: AsyncSession) -> list[int]:
    """Return distinct hours at which meals were logged on a date."""
    day_start = datetime.combine(target_date, dt_time.min)
    day_end = datetime.combine(target_date, dt_time.max)

    result = await session.execute(
        select(AIFoodLog.logged_at).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
        )
    )
    rows = result.all()
    return list({row[0].hour for row in rows})


async def _get_water_ml(user_id: int, target_date: date, session: AsyncSession) -> float:
    """Return water intake in ml from DailyNutritionSummary."""
    result = await session.exec(
        select(DailyNutritionSummary.water_ml).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == target_date,
        )
    )
    water = result.first()
    return float(water) if water is not None else 0.0


async def get_consecutive_no_log_days(user_id: int, session: AsyncSession) -> int:
    """Count consecutive days without any food log, going backwards from yesterday."""
    today = date.today()
    consecutive = 0
    check_date = today - timedelta(days=1)

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
        if (result.scalar() or 0) > 0:
            break
        consecutive += 1
        check_date -= timedelta(days=1)
        # Safety cap: don't scan more than 365 days
        if consecutive >= 365:
            break

    return consecutive


# ---------------------------------------------------------------------------
# Adherence status classification
# ---------------------------------------------------------------------------

def _classify_adherence_status(
    calories_ratio: float,
    no_log_flag: bool,
    goal: str = "maintain",
    trend: str = "stable",
) -> str:
    """Classify adherence status based on caloric ratio (logged/target).

    Item 17: uses goal-specific thresholds.
    Item 12: returns 'at_risk_but_improving' when trend is improving and
             the base status is risk or high_risk.
    """
    if no_log_flag:
        return "critical"
    if calories_ratio == 0:
        return "critical"

    thresholds = GOAL_THRESHOLDS.get(goal, GOAL_THRESHOLDS["maintain"])

    if calories_ratio < thresholds["high_risk_floor"]:
        base = "critical"
    elif calories_ratio < thresholds["risk_floor"]:
        base = "high_risk"
    elif calories_ratio < thresholds["low_adherence_floor"]:
        base = "risk"
    elif calories_ratio < thresholds["optimal_low"]:
        base = "low_adherence"
    elif calories_ratio <= thresholds["optimal_high"]:
        base = "optimal"
    elif calories_ratio <= thresholds["moderate_excess_ceil"]:
        base = "moderate_excess"
    elif calories_ratio <= thresholds["high_excess_ceil"]:
        base = "high_excess"
    else:
        base = "critical"

    # Item 12: at_risk_but_improving override
    if trend == "improving" and base in ("risk", "high_risk"):
        return "at_risk_but_improving"

    return base


# ---------------------------------------------------------------------------
# Daily confidence score (Item 3)
# ---------------------------------------------------------------------------

def _calculate_confidence_score(
    meals_logged: int,
    calories_logged: int,
    protein_logged: int,
    carbs_logged: int,
    fats_logged: int,
    meal_hours: list[int],
) -> int:
    """
    Data confidence score (0-100) — how reliable is today's log data.
    - 40% meal coverage (4 meals = 100%, 3 = 75%, 2 = 50%, 1 = 25%, 0 = 0%)
    - 30% calorie plausibility (300-5000 kcal = 100%, outside = penalized)
    - 20% macro completeness (all 3 macros > 0 = 100%)
    - 10% time spread (meals in different hours = higher)
    """
    # 1. Meal coverage (40%)
    meal_coverage_map = {0: 0.0, 1: 25.0, 2: 50.0, 3: 75.0}
    meal_coverage = meal_coverage_map.get(meals_logged, 100.0)

    # 2. Calorie plausibility (30%)
    if calories_logged == 0:
        cal_plausibility = 0.0
    elif 300 <= calories_logged <= 5000:
        cal_plausibility = 100.0
    elif calories_logged < 300:
        cal_plausibility = max(0.0, (calories_logged / 300.0) * 100.0)
    else:  # > 5000
        cal_plausibility = max(0.0, 100.0 - ((calories_logged - 5000) / 2000.0) * 100.0)

    # 3. Macro completeness (20%)
    macros_present = sum(1 for m in [protein_logged, carbs_logged, fats_logged] if m > 0)
    macro_completeness = (macros_present / 3.0) * 100.0

    # 4. Time spread (10%) — more distinct hours = better (cap at 4)
    distinct_hours = len(set(meal_hours))
    time_spread = min(100.0, (distinct_hours / 4.0) * 100.0)

    total = (
        meal_coverage * 0.40
        + cal_plausibility * 0.30
        + macro_completeness * 0.20
        + time_spread * 0.10
    )
    return max(0, min(100, int(round(total))))


# ---------------------------------------------------------------------------
# Diet quality score (0-100)
# ---------------------------------------------------------------------------

def _calculate_diet_quality_score(
    calories_ratio: float,
    protein_logged: int,
    protein_target: int,
    distinct_meals: int,
    carbs_logged: int,
    fats_logged: int,
    water_ml: float,
    total_calories_logged: int,
) -> int:
    """
    Composite diet quality score (0-100):
    - 30% calorie compliance
    - 25% protein compliance
    - 20% meal distribution (>=3 meals = 100%, 2=60%, 1=30%, 0=0%)
    - 15% macro balance (penalize >80% from single macro)
    - 10% hydration (water_ml / 2500 * 100, cap 100)
    """
    # 1. Calorie compliance (30%) — closer to 1.0 = better
    cal_deviation = abs(1.0 - calories_ratio)
    cal_score = max(0.0, 1.0 - cal_deviation) * 100

    # 2. Protein compliance (25%)
    protein_ratio = protein_logged / protein_target if protein_target > 0 else 0
    protein_deviation = abs(1.0 - protein_ratio)
    protein_score = max(0.0, 1.0 - protein_deviation) * 100

    # 3. Meal distribution (20%)
    if distinct_meals >= 3:
        meal_score = 100.0
    elif distinct_meals == 2:
        meal_score = 60.0
    elif distinct_meals == 1:
        meal_score = 30.0
    else:
        meal_score = 0.0

    # 4. Macro balance (15%) — penalize if >80% calories from one macro
    macro_balance_score = 100.0
    if total_calories_logged > 0:
        protein_cal_pct = (protein_logged * 4) / total_calories_logged
        carbs_cal_pct = (carbs_logged * 4) / total_calories_logged
        fats_cal_pct = (fats_logged * 9) / total_calories_logged
        max_pct = max(protein_cal_pct, carbs_cal_pct, fats_cal_pct)
        if max_pct > 0.80:
            macro_balance_score = max(0.0, (1.0 - max_pct) * 500)  # rapid penalty
        elif max_pct > 0.60:
            macro_balance_score = 70.0
        else:
            macro_balance_score = 100.0

    # 5. Hydration (10%)
    hydration_score = min(100.0, (water_ml / 2500.0) * 100)

    total = (
        cal_score * 0.30
        + protein_score * 0.25
        + meal_score * 0.20
        + macro_balance_score * 0.15
        + hydration_score * 0.10
    )
    return max(0, min(100, int(round(total))))


# ---------------------------------------------------------------------------
# Nutrition risk score (0-100)
# ---------------------------------------------------------------------------

def _calculate_risk_score(
    consecutive_no_log_days: int,
    calories_ratio: float,
    protein_logged: int,
    protein_target: int,
    carbs_logged: int,
    carbs_target: int,
    fats_logged: int,
    fats_target: int,
    diet_quality_score: int,
) -> int:
    """
    Nutrition risk score (0-100, higher = worse):
    - 35% consecutive days without logging
    - 35% caloric deviation
    - 15% macro non-compliance
    - 15% inverse diet quality
    """
    # 1. No-log days risk (35%) — 0 days = 0 risk, 7+ days = 100 risk
    no_log_risk = min(100.0, (consecutive_no_log_days / 7.0) * 100)

    # 2. Caloric deviation risk (35%) — 0 deviation = 0 risk, >0.5 deviation = 100
    cal_deviation = abs(1.0 - calories_ratio)
    cal_risk = min(100.0, (cal_deviation / 0.5) * 100)

    # 3. Macro non-compliance (15%) — average deviation of all macros
    macro_deviations = []
    if protein_target > 0:
        macro_deviations.append(abs(1.0 - (protein_logged / protein_target)))
    if carbs_target > 0:
        macro_deviations.append(abs(1.0 - (carbs_logged / carbs_target)))
    if fats_target > 0:
        macro_deviations.append(abs(1.0 - (fats_logged / fats_target)))
    avg_macro_dev = sum(macro_deviations) / len(macro_deviations) if macro_deviations else 0
    macro_risk = min(100.0, (avg_macro_dev / 0.5) * 100)

    # 4. Inverse diet quality (15%)
    quality_risk = 100.0 - diet_quality_score

    total = (
        no_log_risk * 0.35
        + cal_risk * 0.35
        + macro_risk * 0.15
        + quality_risk * 0.15
    )
    return max(0, min(100, int(round(total))))


# ---------------------------------------------------------------------------
# 7-day consistency score (Item 10)
# ---------------------------------------------------------------------------

def _calculate_consistency_score(records: list[DailyNutritionAdherence]) -> int:
    """
    Calculate a 7-day consistency score (0-100):
    - Base: (days_logged / 7) * 100
    - Bonus +10 for streak >= 3 consecutive days with data
    - Bonus +10 for consistent meal timing (std dev of first meal hour < 2)
    """
    if not records:
        return 0

    # Days with actual food data (not no_log)
    days_with_data = sum(1 for r in records if not r.no_log_flag)
    base_score = (days_with_data / 7.0) * 100.0

    # Streak bonus: check for >= 3 consecutive logged days
    sorted_records = sorted(records, key=lambda r: r.date)
    max_streak = 0
    current_streak = 0
    for r in sorted_records:
        if not r.no_log_flag:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0
    streak_bonus = 10.0 if max_streak >= 3 else 0.0

    # Timing consistency bonus: std dev of first meal hour
    # We use the created_at time of records that have data as a proxy
    meal_hours = []
    for r in sorted_records:
        if not r.no_log_flag and r.created_at:
            meal_hours.append(r.created_at.hour)

    timing_bonus = 0.0
    if len(meal_hours) >= 2:
        mean_h = sum(meal_hours) / len(meal_hours)
        variance = sum((h - mean_h) ** 2 for h in meal_hours) / len(meal_hours)
        std_dev = math.sqrt(variance)
        if std_dev < 2.0:
            timing_bonus = 10.0

    return max(0, min(100, int(round(base_score + streak_bonus + timing_bonus))))


# ---------------------------------------------------------------------------
# Recovery score (Item 11)
# ---------------------------------------------------------------------------

def _calculate_recovery_score(records: list[DailyNutritionAdherence]) -> dict:
    """
    Compare last 3 days avg risk vs days 4-7 avg risk.
    If improving by > 10 points: {"recovering": true, "improvement_pct": X}
    Otherwise: {"recovering": false, "improvement_pct": 0}
    """
    if len(records) < 4:
        return {"recovering": False, "improvement_pct": 0}

    sorted_records = sorted(records, key=lambda r: r.date, reverse=True)

    # Last 3 days (most recent)
    last_3 = sorted_records[:3]
    last_3_avg = sum(r.nutrition_risk_score for r in last_3) / len(last_3)

    # Days 4-7 (older)
    older = sorted_records[3:]
    older_avg = sum(r.nutrition_risk_score for r in older) / len(older)

    improvement = older_avg - last_3_avg  # positive means improving (risk went down)

    if improvement > 10:
        pct = int(round((improvement / older_avg) * 100)) if older_avg > 0 else 0
        return {"recovering": True, "improvement_pct": pct}

    return {"recovering": False, "improvement_pct": 0}


# ---------------------------------------------------------------------------
# Primary risk reason identification (Item 49)
# ---------------------------------------------------------------------------

def _identify_primary_risk_reason(
    no_log_flag: bool,
    zero_calories_flag: bool,
    calories_ratio: float,
    protein_logged: int,
    protein_target: int,
    diet_quality_score: int,
    total_calories_logged: int,
    carbs_logged: int,
    fats_logged: int,
) -> tuple[str, Optional[str]]:
    """
    Analyze which factor contributed most to the risk score.
    Returns (primary_reason, secondary_reason).

    Possible reasons: "no_log", "low_calories", "excess", "bad_quality",
                      "low_protein", "macro_imbalance"
    """
    scores: dict[str, float] = {}

    # no_log: user didn't log anything
    if no_log_flag:
        scores["no_log"] = 100.0
    elif zero_calories_flag:
        scores["low_calories"] = 90.0

    # Caloric deviation
    if calories_ratio < 0.5:
        scores["low_calories"] = max(scores.get("low_calories", 0), (1.0 - calories_ratio) * 100)
    elif calories_ratio > 1.15:
        scores["excess"] = (calories_ratio - 1.0) * 200  # amplify

    # Protein
    if protein_target > 0:
        protein_ratio = protein_logged / protein_target
        if protein_ratio < 0.5:
            scores["low_protein"] = (1.0 - protein_ratio) * 80

    # Diet quality
    if diet_quality_score < 40:
        scores["bad_quality"] = (100 - diet_quality_score) * 0.8

    # Macro imbalance
    if total_calories_logged > 0:
        protein_cal_pct = (protein_logged * 4) / total_calories_logged
        carbs_cal_pct = (carbs_logged * 4) / total_calories_logged
        fats_cal_pct = (fats_logged * 9) / total_calories_logged
        max_pct = max(protein_cal_pct, carbs_cal_pct, fats_cal_pct)
        if max_pct > 0.65:
            scores["macro_imbalance"] = max_pct * 80

    if not scores:
        return ("no_log" if no_log_flag else "low_calories", None)

    sorted_reasons = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    primary = sorted_reasons[0][0]
    secondary = sorted_reasons[1][0] if len(sorted_reasons) > 1 else None
    return (primary, secondary)


# ---------------------------------------------------------------------------
# Intervention cooldown (Item 20)
# ---------------------------------------------------------------------------

def _should_send_intervention(user_id: int, severity: str) -> tuple[bool, Optional[datetime], Optional[str]]:
    """
    Check if we should send an intervention of this severity.
    Rules:
    - Same intervention type not within the last 24 hours
    - Max 1 push per day per severity level

    Returns (should_send, last_intervention_at, last_intervention_type).
    """
    key = f"{user_id}:{severity}"
    now = datetime.utcnow()
    last_at = _intervention_cooldowns.get(key)

    if last_at is not None and (now - last_at) < timedelta(hours=24):
        return (False, last_at, severity)

    return (True, last_at, severity)


def _record_intervention(user_id: int, severity: str) -> None:
    """Record that an intervention was sent so cooldown kicks in."""
    key = f"{user_id}:{severity}"
    _intervention_cooldowns[key] = datetime.utcnow()


# ---------------------------------------------------------------------------
# Cause-specific message selection (Item 36)
# ---------------------------------------------------------------------------

def _select_intervention_message(
    primary_reason: str,
    consecutive_days: int,
    cal_logged: int,
    cal_target: int,
    protein_logged: int,
    protein_target: int,
) -> dict:
    """
    Pick a cause-specific message template based on the primary risk reason.
    Rotates among variants using a simple hash of the current date to avoid repetition.
    """
    templates = CAUSE_MESSAGES.get(primary_reason)
    if not templates:
        return {}

    # Deterministic daily rotation: hash the date to pick a variant
    day_str = date.today().isoformat()
    idx = int(hashlib.md5(day_str.encode()).hexdigest(), 16) % len(templates)
    template = dict(templates[idx])

    # Interpolate placeholders
    pct = int((cal_logged / cal_target * 100)) if cal_target > 0 else 0
    protein_pct = int((protein_logged / protein_target * 100)) if protein_target > 0 else 0

    for key in ("push_title", "push_body"):
        if key in template and isinstance(template[key], str):
            template[key] = template[key].format(
                days=consecutive_days,
                pct=pct,
                cal=cal_logged,
                target=cal_target,
                protein_pct=protein_pct,
            )

    return template


# ---------------------------------------------------------------------------
# Main calculation
# ---------------------------------------------------------------------------

async def calculate_daily_adherence(
    user_id: int,
    target_date: date,
    session: AsyncSession,
) -> DailyNutritionAdherence:
    """
    Calculate (or update) the adherence record for user_id on target_date.
    Persists the result in daily_nutrition_adherence and returns it.
    """
    goals = await _get_goals(user_id, session)
    totals = await _get_day_totals(user_id, target_date, session)
    distinct_meals = await _get_distinct_meals_count(user_id, target_date, session)
    meal_hours = await _get_meal_hours(user_id, target_date, session)
    water_ml = await _get_water_ml(user_id, target_date, session)
    consecutive_no_log = await get_consecutive_no_log_days(user_id, session)

    # Item 17: get user goal for threshold selection
    user_goal = await _get_user_goal(user_id, session)

    calories_target = goals["calories"]
    calories_logged = int(totals["calories"])
    calories_ratio = calories_logged / calories_target if calories_target > 0 else 0.0

    protein_target = goals["protein_g"]
    protein_logged = int(totals["protein_g"])
    carbs_target = goals["carbs_g"]
    carbs_logged = int(totals["carbs_g"])
    fats_target = goals["fat_g"]
    fats_logged = int(totals["fat_g"])

    # Item 1: Separate no_log from zero_calories
    no_log_flag = totals["meal_count"] == 0
    zero_calories_flag = totals["meal_count"] > 0 and calories_logged == 0

    # Item 17 + Item 12: goal-aware classification (trend defaults to stable for daily calc)
    adherence_status = _classify_adherence_status(
        calories_ratio, no_log_flag, goal=user_goal
    )

    # Item 3: Confidence score
    confidence_score = _calculate_confidence_score(
        meals_logged=totals["meal_count"],
        calories_logged=calories_logged,
        protein_logged=protein_logged,
        carbs_logged=carbs_logged,
        fats_logged=fats_logged,
        meal_hours=meal_hours,
    )

    diet_quality_score = _calculate_diet_quality_score(
        calories_ratio=calories_ratio,
        protein_logged=protein_logged,
        protein_target=protein_target,
        distinct_meals=distinct_meals,
        carbs_logged=carbs_logged,
        fats_logged=fats_logged,
        water_ml=water_ml,
        total_calories_logged=calories_logged,
    )

    nutrition_risk_score = _calculate_risk_score(
        consecutive_no_log_days=consecutive_no_log,
        calories_ratio=calories_ratio,
        protein_logged=protein_logged,
        protein_target=protein_target,
        carbs_logged=carbs_logged,
        carbs_target=carbs_target,
        fats_logged=fats_logged,
        fats_target=fats_target,
        diet_quality_score=diet_quality_score,
    )

    # Adjust risk score: zero_calories is less risky than no_log (Item 1)
    # If user logged meals but got 0 calories, reduce risk by 15%
    if zero_calories_flag and not no_log_flag:
        nutrition_risk_score = max(0, int(nutrition_risk_score * 0.85))

    # Item 19: Grace period — reduce risk score by 50% in first 3 days after onboarding
    grace_period = False
    onboarding_result = await session.exec(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = onboarding_result.first()
    if onboarding and onboarding.completed_at:
        days_since = (datetime.combine(target_date, dt_time.min) - onboarding.completed_at).days
        if 0 <= days_since <= 3:
            grace_period = True
            nutrition_risk_score = max(0, int(nutrition_risk_score * 0.50))

    # Upsert: check for existing record
    result = await session.exec(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date == target_date,
        )
    )
    existing = result.first()

    if existing:
        existing.calories_target = calories_target
        existing.calories_logged = calories_logged
        existing.calories_ratio = round(calories_ratio, 4)
        existing.meals_logged = totals["meal_count"]
        existing.protein_target = protein_target
        existing.protein_logged = protein_logged
        existing.carbs_target = carbs_target
        existing.carbs_logged = carbs_logged
        existing.fats_target = fats_target
        existing.fats_logged = fats_logged
        existing.diet_quality_score = diet_quality_score
        existing.adherence_status = adherence_status
        existing.nutrition_risk_score = nutrition_risk_score
        existing.no_log_flag = no_log_flag
        session.add(existing)
        await session.commit()
        await session.refresh(existing)
        return existing

    adherence = DailyNutritionAdherence(
        user_id=user_id,
        date=target_date,
        calories_target=calories_target,
        calories_logged=calories_logged,
        calories_ratio=round(calories_ratio, 4),
        meals_logged=totals["meal_count"],
        protein_target=protein_target,
        protein_logged=protein_logged,
        carbs_target=carbs_target,
        carbs_logged=carbs_logged,
        fats_target=fats_target,
        fats_logged=fats_logged,
        diet_quality_score=diet_quality_score,
        adherence_status=adherence_status,
        nutrition_risk_score=nutrition_risk_score,
        no_log_flag=no_log_flag,
    )
    session.add(adherence)
    await session.commit()
    await session.refresh(adherence)
    return adherence


# ---------------------------------------------------------------------------
# Risk summary (last 7 days)
# ---------------------------------------------------------------------------

async def get_user_risk_summary(user_id: int, session: AsyncSession) -> dict:
    """
    Return a risk summary for the last 7 days:
    - avg_risk_score, avg_quality_score (weighted: last 3 days @ 2x)
    - consecutive_no_log_days
    - trend (improving / worsening / stable)
    - suggested interventions based on current status
    - confidence_score, primary/secondary risk reasons, intervention metadata
    """
    today = date.today()

    # Calculate adherence for today (ensures fresh data)
    today_adherence = await calculate_daily_adherence(user_id, today, session)

    # Fetch last 7 days of adherence records
    week_ago = today - timedelta(days=6)
    result = await session.exec(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date >= week_ago,
            DailyNutritionAdherence.date <= today,
        )
    )
    records = list(result.all())

    # Fetch today's totals for risk reason analysis
    totals = await _get_day_totals(user_id, today, session)
    meal_hours = await _get_meal_hours(user_id, today, session)
    goals = await _get_goals(user_id, session)

    no_log_flag = totals["meal_count"] == 0
    zero_calories_flag = totals["meal_count"] > 0 and int(totals["calories"]) == 0

    # Item 49: identify risk reasons
    primary_reason, secondary_reason = _identify_primary_risk_reason(
        no_log_flag=no_log_flag,
        zero_calories_flag=zero_calories_flag,
        calories_ratio=today_adherence.calories_ratio,
        protein_logged=today_adherence.protein_logged,
        protein_target=today_adherence.protein_target,
        diet_quality_score=today_adherence.diet_quality_score,
        total_calories_logged=today_adherence.calories_logged,
        carbs_logged=today_adherence.carbs_logged,
        fats_logged=today_adherence.fats_logged,
    )

    # Item 3: confidence score for today
    confidence_score = _calculate_confidence_score(
        meals_logged=totals["meal_count"],
        calories_logged=int(totals["calories"]),
        protein_logged=int(totals["protein_g"]),
        carbs_logged=int(totals["carbs_g"]),
        fats_logged=int(totals["fat_g"]),
        meal_hours=meal_hours,
    )

    if not records:
        consecutive = await get_consecutive_no_log_days(user_id, session)
        intervention = _get_intervention(
            "critical", consecutive, 0, 0,
            user_id=user_id,
            calories_ratio=0.0,
            primary_reason="no_log",
            protein_logged=0,
            protein_target=goals["protein_g"],
        )
        return {
            "avg_risk_score": 100,
            "avg_quality_score": 0,
            "avg_calories_logged": 0,
            "consecutive_no_log_days": consecutive,
            "days_with_data": 0,
            "trend": "worsening",
            "current_status": "critical",
            "intervention": intervention,
            "confidence_score": 0,
            "intervention_triggered": intervention.get("triggered", False),
            "intervention_type": "critical",
            "primary_risk_reason": "no_log",
            "secondary_risk_reason": None,
            "consistency_score_7d": 0,
            "recovery": {"recovering": False, "improvement_pct": 0},
        }

    # Item 15: weighted averages — last 3 days at 2x weight
    sorted_records = sorted(records, key=lambda r: r.date)
    cutoff_date = today - timedelta(days=2)  # last 3 days: today, yesterday, day before

    weighted_risk_sum = 0.0
    weighted_quality_sum = 0.0
    total_weight = 0.0
    for r in sorted_records:
        w = 2.0 if r.date >= cutoff_date else 1.0
        weighted_risk_sum += r.nutrition_risk_score * w
        weighted_quality_sum += r.diet_quality_score * w
        total_weight += w

    avg_risk = int(round(weighted_risk_sum / total_weight)) if total_weight > 0 else 0
    avg_quality = int(round(weighted_quality_sum / total_weight)) if total_weight > 0 else 0
    avg_calories = int(round(sum(r.calories_logged for r in sorted_records) / len(sorted_records))) if sorted_records else 0

    # Trend: compare first half vs second half of the window
    consecutive = await get_consecutive_no_log_days(user_id, session)

    if len(sorted_records) >= 4:
        mid = len(sorted_records) // 2
        first_half_risk = sum(r.nutrition_risk_score for r in sorted_records[:mid]) / mid
        second_half_risk = sum(r.nutrition_risk_score for r in sorted_records[mid:]) / (len(sorted_records) - mid)
        if second_half_risk < first_half_risk - 5:
            trend = "improving"
        elif second_half_risk > first_half_risk + 5:
            trend = "worsening"
        else:
            trend = "stable"
    else:
        trend = "stable"

    # Item 10: consistency score
    consistency_score_7d = _calculate_consistency_score(records)

    # Item 11: recovery score
    recovery = _calculate_recovery_score(records)

    # Item 12: re-classify today's status with trend awareness
    user_goal = await _get_user_goal(user_id, session)
    current_status = _classify_adherence_status(
        today_adherence.calories_ratio,
        today_adherence.no_log_flag,
        goal=user_goal,
        trend=trend,
    )

    # Item 39: skip aggressive intervention if user already corrected today
    display_status = current_status
    if (
        today_adherence.calories_logged > 0
        and today_adherence.calories_ratio > 0.7
    ):
        if current_status == "critical":
            display_status = "risk"
        elif current_status == "high_risk":
            display_status = "low_adherence"

    intervention = _get_intervention(
        display_status,
        consecutive,
        today_adherence.calories_logged,
        today_adherence.calories_target,
        user_id=user_id,
        calories_ratio=today_adherence.calories_ratio,
        primary_reason=primary_reason,
        protein_logged=today_adherence.protein_logged,
        protein_target=today_adherence.protein_target,
    )

    return {
        "avg_risk_score": avg_risk,
        "avg_quality_score": avg_quality,
        "avg_calories_logged": avg_calories,
        "consecutive_no_log_days": consecutive,
        "days_with_data": len(records),
        "trend": trend,
        "current_status": current_status,
        "intervention": intervention,
        "confidence_score": confidence_score,
        "intervention_triggered": intervention.get("triggered", False),
        "intervention_type": display_status,
        "primary_risk_reason": primary_reason,
        "secondary_risk_reason": secondary_reason,
        "consistency_score_7d": consistency_score_7d,
        "recovery": recovery,
    }


def _get_intervention(
    status: str,
    consecutive_days: int,
    cal_logged: int,
    cal_target: int,
    *,
    user_id: int = 0,
    calories_ratio: float = 0.0,
    primary_reason: str = "no_log",
    protein_logged: int = 0,
    protein_target: int = 0,
) -> dict:
    """Build an intervention payload for the given status."""
    template = INTERVENTIONS.get(status, INTERVENTIONS["optimal"])
    intervention = dict(template)

    # Interpolate placeholders
    pct = int((cal_logged / cal_target * 100)) if cal_target > 0 else 0
    for key in ("push_title", "push_body", "coach_message"):
        if key in intervention and isinstance(intervention[key], str):
            intervention[key] = intervention[key].format(
                days=consecutive_days,
                pct=pct,
                cal=cal_logged,
                target=cal_target,
            )

    # Item 36: overlay cause-specific message if available
    cause_msg = _select_intervention_message(
        primary_reason=primary_reason,
        consecutive_days=consecutive_days,
        cal_logged=cal_logged,
        cal_target=cal_target,
        protein_logged=protein_logged,
        protein_target=protein_target,
    )
    if cause_msg:
        intervention["push_title"] = cause_msg.get("push_title", intervention.get("push_title", ""))
        intervention["push_body"] = cause_msg.get("push_body", intervention.get("push_body", ""))

    # Item 20: cooldown check
    should_send, last_at, last_type = _should_send_intervention(user_id, status)
    intervention["triggered"] = should_send
    intervention["suppressed_by_cooldown"] = not should_send
    intervention["last_intervention_at"] = last_at.isoformat() if last_at else None
    intervention["last_intervention_type"] = last_type

    if should_send and status != "optimal":
        _record_intervention(user_id, status)

    return intervention


# ---------------------------------------------------------------------------
# Incremental recalculation on food log (Item 58b)
# ---------------------------------------------------------------------------

async def recalculate_on_food_log(user_id: int, session: AsyncSession) -> DailyNutritionAdherence:
    """
    Lightweight recalculation triggered after a food is logged.
    Only recalculates today's adherence — no 7-day summary.
    """
    today = date.today()
    return await calculate_daily_adherence(user_id, today, session)
