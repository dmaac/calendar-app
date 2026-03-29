"""
Nutrition Risk Engine v2 — Rule-based adherence and risk scoring.

AI TOKEN COST: ZERO. This entire module is 100% rule-based.
All scoring, classification, and interventions use deterministic Python logic
and SQL aggregations. No LLM / AI API calls are made anywhere in this file.

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
import json
import logging
import math
import time as time_mod
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.circuit_breaker import get_breaker, CircuitBreakerOpen
from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile
from ..models.workout import WorkoutLog

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

# Cause-specific message templates (Item 36 + Item 37: 5 variants per cause)
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
        {
            "push_title": "Se te olvido registrar?",
            "push_body": "Un simple escaneo y listo. No pierdas tu racha de hoy.",
        },
        {
            "push_title": "Tu registro te espera",
            "push_body": "Cada dia cuenta. Registra aunque sea una comida para mantener el habito.",
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
        {
            "push_title": "Necesitas mas energia",
            "push_body": "Solo {pct}% de tu meta. Tu cuerpo rinde mejor bien alimentado.",
        },
        {
            "push_title": "No te quedes corto",
            "push_body": "{cal} de {target} kcal. Agrega fruta, frutos secos o un batido.",
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
        {
            "push_title": "Sobre tu meta hoy",
            "push_body": "Llevas {pct}% de tu objetivo. Toma agua y elige algo ligero.",
        },
        {
            "push_title": "Ajusta tu proxima comida",
            "push_body": "{cal} kcal registradas. Equilibra con verduras o ensalada.",
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
        {
            "push_title": "Elige mejor calidad",
            "push_body": "Un cambio simple: agrega una porcion de verduras o ensalada.",
        },
        {
            "push_title": "Puedes comer mas saludable",
            "push_body": "Prueba cambiar un snack procesado por fruta o frutos secos.",
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
        {
            "push_title": "Tu musculo necesita proteina",
            "push_body": "Solo {protein_pct}% de tu meta. Agrega atun, queso cottage o tofu.",
        },
        {
            "push_title": "Refuerza tu proteina",
            "push_body": "Agrega una porcion de proteina: huevo duro, pollo o legumbres.",
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
        {
            "push_title": "Equilibra tus nutrientes",
            "push_body": "Tu dieta esta inclinada a un solo macro. Agrega variedad.",
        },
        {
            "push_title": "Variedad en tu plato",
            "push_body": "Combina proteina, carbos complejos y grasas buenas en cada comida.",
        },
    ],
}

# Time-of-day aware message overrides (Item 37)
# Morning (6-12), Afternoon (12-18), Evening (18-6)
TIME_AWARE_MESSAGES: dict[str, dict[str, dict]] = {
    "no_log": {
        "morning": {
            "push_title": "Empieza el dia bien",
            "push_body": "Registra tu desayuno y arranca con energia.",
        },
        "afternoon": {
            "push_title": "Aun no registras hoy",
            "push_body": "La mitad del dia paso. Registra tu almuerzo ahora.",
        },
        "evening": {
            "push_title": "Aun puedes mejorar hoy",
            "push_body": "Registra tu cena antes de dormir. Cada registro cuenta.",
        },
    },
    "low_calories": {
        "morning": {
            "push_title": "Tu dia empezo bajo",
            "push_body": "Llevas {cal} de {target} kcal. Un buen almuerzo te pondra al dia.",
        },
        "afternoon": {
            "push_title": "Calorias bajas a media tarde",
            "push_body": "{cal} de {target} kcal. Agrega un snack y una cena completa.",
        },
        "evening": {
            "push_title": "Dia bajo en calorias",
            "push_body": "Solo {cal} de {target} kcal. Una cena nutritiva puede ayudar.",
        },
    },
    "excess": {
        "morning": {
            "push_title": "Cuidado con el exceso temprano",
            "push_body": "Ya llevas {cal} kcal. Modera el resto del dia.",
        },
        "afternoon": {
            "push_title": "Exceso a media tarde",
            "push_body": "{cal} kcal — {pct}% de tu meta. Elige una cena ligera.",
        },
        "evening": {
            "push_title": "Te pasaste hoy",
            "push_body": "{cal} kcal registradas. Manana es un nuevo dia para equilibrar.",
        },
    },
    "bad_quality": {
        "morning": {
            "push_title": "Mejora la calidad hoy",
            "push_body": "Empieza con un almuerzo balanceado: proteina, verduras y carbos.",
        },
        "afternoon": {
            "push_title": "Aun puedes mejorar tu dieta",
            "push_body": "Elige una cena con verduras frescas y proteina magra.",
        },
        "evening": {
            "push_title": "Calidad baja hoy",
            "push_body": "Manana intenta incluir mas alimentos frescos e integrales.",
        },
    },
    "low_protein": {
        "morning": {
            "push_title": "Sube tu proteina hoy",
            "push_body": "Planea un almuerzo rico en proteina: pollo, pescado o legumbres.",
        },
        "afternoon": {
            "push_title": "Proteina baja a esta hora",
            "push_body": "Agrega un snack proteico: yogurt griego, huevo duro o atun.",
        },
        "evening": {
            "push_title": "Proteina insuficiente hoy",
            "push_body": "Incluye proteina en tu cena: pollo, tofu o legumbres.",
        },
    },
    "macro_imbalance": {
        "morning": {
            "push_title": "Equilibra tus macros hoy",
            "push_body": "Planea comidas variadas: proteina, carbos complejos y grasas buenas.",
        },
        "afternoon": {
            "push_title": "Desbalance de macros",
            "push_body": "En tu proxima comida, equilibra proteina, carbos y grasas.",
        },
        "evening": {
            "push_title": "Macros desbalanceados hoy",
            "push_body": "Manana intenta distribuir mejor tus macronutrientes.",
        },
    },
}


# Intervention priority order (Item 47)
INTERVENTION_PRIORITY: list[str] = [
    "critical", "no_log", "excess", "low_calories",
    "low_protein", "bad_quality", "macro_imbalance",
]


# Rescue sequence for abandonment (Item 41)
RESCUE_SEQUENCE: dict[int, dict] = {
    1: {
        "push_title": "Te echamos de menos!",
        "push_body": "Un registro rapido mantiene tu racha.",
        "in_app_banner": "Llevas 1 dia sin registrar. Un escaneo rapido y listo!",
        "cta_action": "/scan",
        "cta_label": "Registro rapido",
    },
    3: {
        "push_title": "Llevas 3 dias sin registrar",
        "push_body": "Tu plan te espera. Registra algo simple.",
        "in_app_banner": "3 dias sin registro. Tu plan necesita atencion. Vuelve con algo simple.",
        "cta_action": "/api/risk/copy-yesterday",
        "cta_label": "Copiar dia anterior",
    },
    7: {
        "push_title": "Ha pasado una semana",
        "push_body": "Empecemos de nuevo con un desayuno simple.",
        "in_app_banner": "Llevas una semana sin registrar. Empecemos de cero con algo facil.",
        "cta_action": "/api/risk/quick-add-protein",
        "cta_label": "Agregar snack proteico",
    },
}

# In-memory cooldown tracker (per-process; sufficient for single-instance deployments)
# Key: "{user_id}:{severity}" -> datetime of last intervention
_intervention_cooldowns: dict[str, datetime] = {}

# In-memory risk summary cache (Item 71) — 5 min TTL
# Key: user_id -> (timestamp_seconds, summary_dict)
_risk_summary_cache: dict[int, tuple[float, dict]] = {}
_RISK_SUMMARY_TTL = 300  # 5 minutes


# Item 84: Circuit breaker for DB calls in adherence calculation
# 5 consecutive failures -> open; 60s cooldown -> half-open -> probe
_adherence_breaker = get_breaker(
    "adherence_calc",
    failure_threshold=5,
    failure_window=60.0,
    recovery_timeout=60.0,
)


def invalidate_risk_cache(user_id: int) -> None:
    """Remove a user's cached risk summary (Item 72)."""
    _risk_summary_cache.pop(user_id, None)


# ---------------------------------------------------------------------------
# Goal helpers
# ---------------------------------------------------------------------------

async def _get_goals(user_id: int, session: AsyncSession) -> dict:
    """
    Retrieve the user's daily macro goals.
    Priority: UserNutritionProfile > OnboardingProfile > sensible defaults.
    """
    result = await session.execute(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.scalars().first()
    if profile is not None:
        return _validate_goals({
            "calories": int(profile.target_calories),
            "protein_g": int(profile.target_protein_g),
            "fat_g": int(profile.target_fat_g),
            "carbs_g": int(profile.target_carbs_g),
        })

    result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.scalars().first()
    if onboarding is not None and onboarding.daily_calories is not None:
        return _validate_goals({
            "calories": int(onboarding.daily_calories),
            "protein_g": int(onboarding.daily_protein_g or 150),
            "fat_g": int(onboarding.daily_fats_g or 65),
            "carbs_g": int(onboarding.daily_carbs_g or 250),
        })

    return _validate_goals({"calories": 2000, "protein_g": 150, "fat_g": 65, "carbs_g": 250})


def _validate_goals(goals: dict) -> dict:
    """Validate and sanitize nutrition goals (Item 77)."""
    defaults = {"calories": 2000, "protein_g": 150, "fat_g": 65, "carbs_g": 250}

    calories = goals.get("calories", defaults["calories"])
    if calories is None or calories <= 0 or calories > 10000:
        logger.warning("Invalid calorie goal %s, using default 2000", calories)
        calories = defaults["calories"]

    protein_g = max(0, goals.get("protein_g", defaults["protein_g"]) or 0)
    fat_g = max(0, goals.get("fat_g", defaults["fat_g"]) or 0)
    carbs_g = max(0, goals.get("carbs_g", defaults["carbs_g"]) or 0)

    # Sanity check: total macro calories should not exceed 1.5x calorie target
    macro_calories = (protein_g * 4) + (carbs_g * 4) + (fat_g * 9)
    if macro_calories > calories * 1.5:
        logger.warning(
            "Macro calories (%d) exceed 1.5x calorie target (%d), using defaults",
            macro_calories, calories,
        )
        return defaults

    return {"calories": int(calories), "protein_g": int(protein_g), "fat_g": int(fat_g), "carbs_g": int(carbs_g)}


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
    result = await session.execute(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.scalars().first()
    if profile is not None and profile.goal:
        return profile.goal.value if hasattr(profile.goal, "value") else str(profile.goal)

    result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.scalars().first()
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
            AIFoodLog.deleted_at.is_(None),
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
            AIFoodLog.deleted_at.is_(None),
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
            AIFoodLog.deleted_at.is_(None),
        )
    )
    rows = result.all()
    return list({row[0].hour for row in rows})


async def _get_water_ml(user_id: int, target_date: date, session: AsyncSession) -> float:
    """Return water intake in ml from DailyNutritionSummary."""
    result = await session.execute(
        select(DailyNutritionSummary.water_ml).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == target_date,
        )
    )
    water = result.scalar()
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
                AIFoodLog.deleted_at.is_(None),
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
        return ("no_log" if no_log_flag else "low_calories", None, [])

    sorted_reasons = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    primary = sorted_reasons[0][0]
    secondary = sorted_reasons[1][0] if len(sorted_reasons) > 1 else None

    # Item 70: Build all_risk_factors with scores and pct_contribution
    total_score = sum(s for _, s in sorted_reasons) or 1.0
    all_risk_factors = [
        {
            "reason": reason,
            "score": round(score, 1),
            "pct_contribution": round((score / total_score) * 100, 1),
        }
        for reason, score in sorted_reasons
    ]

    return (primary, secondary, all_risk_factors)


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
    now = datetime.now(timezone.utc)
    last_at = _intervention_cooldowns.get(key)

    if last_at is not None and (now - last_at) < timedelta(hours=24):
        return (False, last_at, severity)

    return (True, last_at, severity)


def _record_intervention(user_id: int, severity: str) -> None:
    """Record that an intervention was sent so cooldown kicks in."""
    key = f"{user_id}:{severity}"
    _intervention_cooldowns[key] = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Time-of-day awareness (Item 37)
# ---------------------------------------------------------------------------

def _get_time_period() -> str:
    """Return 'morning', 'afternoon', or 'evening' based on current UTC hour."""
    hour = datetime.now(timezone.utc).hour
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 18:
        return "afternoon"
    return "evening"


def _get_time_aware_message(
    primary_reason: str,
    cal_logged: int,
    cal_target: int,
    protein_logged: int,
    protein_target: int,
    consecutive_days: int,
) -> Optional[dict]:
    """
    Return a time-of-day specific message override for the given cause (Item 37).
    Returns None if no time-aware message is available for this reason.
    """
    period = _get_time_period()
    reason_messages = TIME_AWARE_MESSAGES.get(primary_reason)
    if not reason_messages:
        return None
    template_data = reason_messages.get(period)
    if not template_data:
        return None

    template = dict(template_data)

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
# Rescue sequence for abandonment (Item 41)
# ---------------------------------------------------------------------------

def _get_rescue_sequence(consecutive_no_log_days: int) -> Optional[dict]:
    """
    Return a rescue intervention for users who stopped logging.
    Day 1: gentle reminder
    Day 3: urgency
    Day 7+: re-engagement
    """
    if consecutive_no_log_days >= 7:
        return dict(RESCUE_SEQUENCE[7])
    elif consecutive_no_log_days >= 3:
        return dict(RESCUE_SEQUENCE[3])
    elif consecutive_no_log_days >= 1:
        return dict(RESCUE_SEQUENCE[1])
    return None


# ---------------------------------------------------------------------------
# User correction detection (Item 38)
# ---------------------------------------------------------------------------

async def _user_corrected_today(
    user_id: int,
    session: AsyncSession,
) -> bool:
    """
    Check if the user's calories_ratio improved from < 0.5 to > 0.7 today.
    Looks at the existing adherence record vs current food log totals.
    """
    today = date.today()
    result = await session.execute(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date == today,
        )
    )
    existing = result.scalars().first()
    if existing is None:
        return False

    # The existing record had low ratio, check if current totals show improvement
    old_ratio = existing.calories_ratio
    if old_ratio >= 0.5:
        return False

    # Get current totals
    totals = await _get_day_totals(user_id, today, session)
    goals = await _get_goals(user_id, session)
    cal_target = goals["calories"]
    current_ratio = totals["calories"] / cal_target if cal_target > 0 else 0.0

    return current_ratio > 0.7


POSITIVE_CORRECTION_MESSAGE: dict = {
    "push_title": "Excelente! Corregiste tu registro",
    "push_body": "Sigue asi. Tu constancia es clave para cumplir tu meta.",
    "color": "#22C55E",
    "home_banner": False,
}


# ---------------------------------------------------------------------------
# Cause-specific message selection (Item 36 + Item 37 time awareness)
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
    Item 37: Prefers time-of-day aware message when available.
    Rotates among variants using a simple hash of the current date to avoid repetition.
    """
    # Item 37: Try time-aware message first
    time_msg = _get_time_aware_message(
        primary_reason, cal_logged, cal_target, protein_logged, protein_target, consecutive_days,
    )
    if time_msg:
        return time_msg

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
    *,
    day_type: Optional[str] = None,
) -> DailyNutritionAdherence:
    """
    Calculate (or update) the adherence record for user_id on target_date.
    Persists the result in daily_nutrition_adherence and returns it.

    Args:
        day_type: Optional day type (rest/training/refeed) to adjust targets
                  using variable_plan_service multipliers (Item 7).
    """
    _t0 = time_mod.perf_counter()

    # Item 84: Circuit breaker — if DB is consistently failing, return a safe default
    if not _adherence_breaker.allow_request():
        logger.warning(
            "Circuit breaker OPEN for adherence_calc, returning default for user %d",
            user_id,
        )
        # Return a minimal safe default record
        existing_result = await session.execute(
            select(DailyNutritionAdherence).where(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.date == target_date,
            )
        )
        existing_cached = existing_result.scalars().first()
        if existing_cached:
            return existing_cached
        # No cached record — return a new default
        return DailyNutritionAdherence(
            user_id=user_id,
            date=target_date,
            calories_target=2000,
            adherence_status="critical",
            no_log_flag=True,
        )

    try:
        result = await _calculate_daily_adherence_inner(
            user_id, target_date, session, day_type=day_type
        )
        _adherence_breaker.record_success()
        return result
    except CircuitBreakerOpen:
        raise
    except Exception:
        _adherence_breaker.record_failure()
        raise


async def _calculate_daily_adherence_inner(
    user_id: int,
    target_date: date,
    session: AsyncSession,
    *,
    day_type: Optional[str] = None,
) -> DailyNutritionAdherence:
    """Inner implementation of calculate_daily_adherence (wrapped by circuit breaker)."""
    _t0 = time_mod.perf_counter()

    # Item 18: Check onboarding completion status early (reused for grace period below)
    onboarding_result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = onboarding_result.scalars().first()
    onboarding_complete = onboarding is not None and onboarding.completed_at is not None

    # Item 18: Use generous defaults if onboarding not completed
    if not onboarding_complete:
        goals = _validate_goals({"calories": 2000, "protein_g": 150, "fat_g": 65, "carbs_g": 250})
    else:
        goals = await _get_goals(user_id, session)

    # Item 7: Apply variable plan multipliers if day_type is provided
    if day_type is not None:
        from .variable_plan_service import DAY_TYPES
        if day_type in DAY_TYPES:
            dt_cfg = DAY_TYPES[day_type]
            goals = {
                "calories": int(round(goals["calories"] * dt_cfg["calorie_multiplier"])),
                "protein_g": int(round(goals["protein_g"] * dt_cfg["protein_multiplier"])),
                "carbs_g": int(round(goals["carbs_g"] * dt_cfg["carb_multiplier"])),
                "fat_g": int(round(goals["fat_g"] * dt_cfg["fat_multiplier"])),
            }

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
    if onboarding and onboarding.completed_at:
        days_since = (datetime.combine(target_date, dt_time.min) - onboarding.completed_at).days
        if 0 <= days_since <= 3:
            grace_period = True
            nutrition_risk_score = max(0, int(nutrition_risk_score * 0.50))

    # Item 18: Reduce risk score by 30% for incomplete onboarding users
    if not onboarding_complete:
        nutrition_risk_score = max(0, int(nutrition_risk_score * 0.70))

    # Item 7: Build plan_snapshot JSON with day_type and onboarding info
    plan_snapshot_dict = {
        "calories": calories_target,
        "protein_g": protein_target,
        "carbs_g": carbs_target,
        "fat_g": fats_target,
        "onboarding_complete": onboarding_complete,
    }
    if day_type is not None:
        plan_snapshot_dict["day_type"] = day_type
    plan_snapshot_str = json.dumps(plan_snapshot_dict)

    # Upsert: check for existing record
    result = await session.execute(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date == target_date,
        )
    )
    existing = result.scalars().first()

    if existing:
        # Item 82 + Item 85: Idempotent recalculation — skip DB write if nothing changed
        # Also check plan_snapshot: if plan changed, recalculate even if totals match
        if (
            existing.calories_logged == calories_logged
            and existing.meals_logged == totals["meal_count"]
            and existing.calories_target == calories_target
            and existing.nutrition_risk_score == nutrition_risk_score
            and existing.plan_snapshot == plan_snapshot_str
        ):
            _duration_ms = (time_mod.perf_counter() - _t0) * 1000
            logger.debug("Skipping idempotent recalc for user %d, date %s", user_id, target_date)
            if _duration_ms > 500:
                logger.warning("Risk calculation for user %d took %.2fms (idempotent skip)", user_id, _duration_ms)
            else:
                logger.info("Risk calculation for user %d took %.2fms (idempotent skip)", user_id, _duration_ms)
            return existing

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
        existing.plan_snapshot = plan_snapshot_str
        session.add(existing)
        await session.commit()
        await session.refresh(existing)
        _duration_ms = (time_mod.perf_counter() - _t0) * 1000
        if _duration_ms > 500:
            logger.warning("Risk calculation for user %d took %.2fms", user_id, _duration_ms)
        else:
            logger.info("Risk calculation for user %d took %.2fms", user_id, _duration_ms)
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
        plan_snapshot=plan_snapshot_str,
    )
    session.add(adherence)
    await session.commit()
    await session.refresh(adherence)
    _duration_ms = (time_mod.perf_counter() - _t0) * 1000
    if _duration_ms > 500:
        logger.warning("Risk calculation for user %d took %.2fms", user_id, _duration_ms)
    else:
        logger.info("Risk calculation for user %d took %.2fms", user_id, _duration_ms)
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
    _t0 = time_mod.perf_counter()

    # Item 71: Check cache first
    cached = _risk_summary_cache.get(user_id)
    if cached is not None:
        cached_ts, cached_data = cached
        if (time_mod.time() - cached_ts) < _RISK_SUMMARY_TTL:
            logger.debug("Risk summary cache hit for user %d", user_id)
            return cached_data

    today = date.today()

    # Calculate adherence for today (ensures fresh data)
    today_adherence = await calculate_daily_adherence(user_id, today, session)

    # Fetch last 7 days of adherence records
    week_ago = today - timedelta(days=6)
    result = await session.execute(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date >= week_ago,
            DailyNutritionAdherence.date <= today,
        )
    )
    records = list(result.scalars().all())

    # Fetch today's totals for risk reason analysis
    totals = await _get_day_totals(user_id, today, session)
    meal_hours = await _get_meal_hours(user_id, today, session)
    goals = await _get_goals(user_id, session)

    no_log_flag = totals["meal_count"] == 0
    zero_calories_flag = totals["meal_count"] > 0 and int(totals["calories"]) == 0

    # Item 49 + Item 70: identify risk reasons with full factor breakdown
    primary_reason, secondary_reason, all_risk_factors = _identify_primary_risk_reason(
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
        no_data_summary = {
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
        _risk_summary_cache[user_id] = (time_mod.time(), no_data_summary)
        _duration_ms = (time_mod.perf_counter() - _t0) * 1000
        if _duration_ms > 500:
            logger.warning("Risk summary for user %d took %.2fms (no data)", user_id, _duration_ms)
        else:
            logger.info("Risk summary for user %d took %.2fms (no data)", user_id, _duration_ms)
        return no_data_summary

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

    # Item 38: Check if user corrected today (ratio improved from < 0.5 to > 0.7)
    corrected_today = await _user_corrected_today(user_id, session)
    if corrected_today:
        intervention = dict(POSITIVE_CORRECTION_MESSAGE)
        intervention["triggered"] = True
        intervention["suppressed_by_cooldown"] = False
        intervention["last_intervention_at"] = None
        intervention["last_intervention_type"] = None
        intervention["cta_action"] = "/scan"
        intervention["cta_label"] = "Seguir registrando"
        # Track correction event
        try:
            from .risk_analytics_service import track_risk_event
            await track_risk_event(
                user_id=user_id,
                event_type="correction_after_intervention",
                metadata={"status": "corrected", "source": "auto_detect"},
                session=session,
            )
        except Exception:
            logger.debug("Failed to track correction event for user %d", user_id)
    else:
        # Item 47: Prioritize single dominant intervention per day
        suppressed_interventions: list[str] = []
        # Build candidate list from all identified risk reasons
        all_reasons = [primary_reason]
        if secondary_reason:
            all_reasons.append(secondary_reason)
        # If multiple interventions would fire, pick highest priority
        dominant_reason = primary_reason
        for priority_reason in INTERVENTION_PRIORITY:
            if priority_reason in all_reasons:
                dominant_reason = priority_reason
                break
        # Suppress non-dominant reasons
        for reason in all_reasons:
            if reason != dominant_reason:
                suppressed_interventions.append(reason)

        intervention = _get_intervention(
            display_status,
            consecutive,
            today_adherence.calories_logged,
            today_adherence.calories_target,
            user_id=user_id,
            calories_ratio=today_adherence.calories_ratio,
            primary_reason=dominant_reason,
            protein_logged=today_adherence.protein_logged,
            protein_target=today_adherence.protein_target,
        )
        intervention["suppressed_interventions"] = suppressed_interventions

    # Item 8: Protein minimum check — read user weight and activity level
    protein_check = None
    onboarding_result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding_profile = onboarding_result.scalars().first()
    if onboarding_profile and onboarding_profile.weight_kg and onboarding_profile.weight_kg > 0:
        # Determine activity level from nutrition profile
        np_result = await session.execute(
            select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
        )
        np = np_result.scalars().first()
        activity_lvl = "moderate"
        if np and np.activity_level:
            lvl_str = np.activity_level.value if hasattr(np.activity_level, "value") else str(np.activity_level)
            if lvl_str == "sedentary":
                activity_lvl = "sedentary"
        protein_check = _check_protein_minimum(
            today_adherence.protein_logged,
            onboarding_profile.weight_kg,
            activity_lvl,
        )

    # Item 63: last_meal_logged_at and last_risk_calculated_at
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)
    last_meal_result = await session.execute(
        select(func.max(AIFoodLog.logged_at)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    last_meal_logged_at_val = last_meal_result.scalar()
    last_meal_logged_at = last_meal_logged_at_val.isoformat() if last_meal_logged_at_val else None
    last_risk_calculated_at = today_adherence.created_at.isoformat() if today_adherence.created_at else None

    # Item 138: Water adherence
    water_ml_today = await _get_water_ml(user_id, today, session)
    water_target = 2500
    water_pct = round((water_ml_today / water_target) * 100) if water_target > 0 else 0
    water_pct = max(0, min(100, water_pct))
    glasses_remaining = max(0, round((water_target - water_ml_today) / 250))
    # on_track = consumed >= 60% of proportional target by current hour
    now_hour = datetime.now().hour
    expected_pct = (now_hour / 24.0) * 100 if now_hour > 0 else 0
    water_on_track = water_pct >= (expected_pct * 0.6)

    water_adherence = {
        "today_ml": round(water_ml_today),
        "target_ml": water_target,
        "pct": water_pct,
        "glasses_remaining": glasses_remaining,
        "on_track": water_on_track,
    }

    summary = {
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
        "primary_risk_reason_code": primary_reason,
        "secondary_risk_reason": secondary_reason,
        "all_risk_factors": all_risk_factors,
        "consistency_score_7d": consistency_score_7d,
        "recovery": recovery,
        "protein_check": protein_check,
        "water_adherence": water_adherence,
        "last_meal_logged_at": last_meal_logged_at,
        "last_risk_calculated_at": last_risk_calculated_at,
    }

    # Item 71: Cache the result
    _risk_summary_cache[user_id] = (time_mod.time(), summary)

    # Item 75: Log duration
    _duration_ms = (time_mod.perf_counter() - _t0) * 1000
    if _duration_ms > 500:
        logger.warning("Risk summary for user %d took %.2fms", user_id, _duration_ms)
    else:
        logger.info("Risk summary for user %d took %.2fms", user_id, _duration_ms)

    return summary


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

    # Item 41: Rescue sequence overrides for no-log abandonment
    if primary_reason == "no_log" and consecutive_days >= 1:
        rescue = _get_rescue_sequence(consecutive_days)
        if rescue:
            intervention["push_title"] = rescue["push_title"]
            intervention["push_body"] = rescue["push_body"]
            intervention["in_app_banner"] = rescue["in_app_banner"]
            intervention["cta_action"] = rescue["cta_action"]
            intervention["cta_label"] = rescue["cta_label"]
    else:
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

    # Items 42-44: Add Quick CTA actions based on primary reason
    if "cta_action" not in intervention:
        if primary_reason == "no_log":
            intervention["cta_action"] = "/scan"
            intervention["cta_label"] = "Registro rapido"
        elif primary_reason == "low_calories":
            intervention["cta_action"] = "/api/risk/copy-yesterday"
            intervention["cta_label"] = "Copiar dia anterior"
        elif primary_reason == "low_protein":
            intervention["cta_action"] = "/api/risk/quick-add-protein"
            intervention["cta_label"] = "Agregar snack proteico"
        elif primary_reason in ("excess", "bad_quality", "macro_imbalance"):
            intervention["cta_action"] = "/scan"
            intervention["cta_label"] = "Registro rapido"

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

async def purge_old_adherence_records(session: AsyncSession, days_to_keep: int = 365) -> int:
    """Delete adherence records older than N days. Returns count deleted.

    Intended for scheduled jobs only -- no endpoint exposed.
    """
    from sqlalchemy import delete as sa_delete

    cutoff = date.today() - timedelta(days=days_to_keep)
    count_result = await session.execute(
        select(func.count(DailyNutritionAdherence.id)).where(
            DailyNutritionAdherence.date < cutoff,
        )
    )
    count = count_result.scalar() or 0

    if count > 0:
        await session.execute(
            sa_delete(DailyNutritionAdherence).where(
                DailyNutritionAdherence.date < cutoff,
            )
        )
        await session.commit()
        logger.info("purge_old_adherence: deleted %d records older than %s", count, cutoff.isoformat())

    return count


async def recalculate_on_food_log(user_id: int, session: AsyncSession) -> DailyNutritionAdherence:
    """
    Lightweight recalculation triggered after a food is logged.
    Only recalculates today's adherence — no 7-day summary.
    """
    invalidate_risk_cache(user_id)
    today = date.today()
    return await calculate_daily_adherence(user_id, today, session)


# ---------------------------------------------------------------------------
# Weekend pattern detection (Item 145)
# ---------------------------------------------------------------------------

async def detect_weekend_pattern(user_id: int, session: AsyncSession) -> dict:
    """
    Compare avg calories/risk for weekdays vs weekends over the last 4 weeks.

    Item 16 enhancements:
    - TIME patterns: detect if first meal on weekends is >2h later than weekday average
    - QUALITY patterns: detect if weekends have lower diet quality scores

    Pattern is detected if weekend avg calories are >20% higher than weekday avg.
    """
    today = date.today()
    four_weeks_ago = today - timedelta(days=28)

    # Fetch all adherence records for the last 4 weeks
    result = await session.execute(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date >= four_weeks_ago,
            DailyNutritionAdherence.date <= today,
        )
    )
    records = list(result.scalars().all())

    weekend_calories: list[int] = []
    weekday_calories: list[int] = []
    weekend_risk: list[int] = []
    weekday_risk: list[int] = []
    weekend_quality: list[int] = []
    weekday_quality: list[int] = []

    for r in records:
        if r.date.weekday() >= 5:
            weekend_calories.append(r.calories_logged)
            weekend_risk.append(r.nutrition_risk_score)
            weekend_quality.append(r.diet_quality_score)
        else:
            weekday_calories.append(r.calories_logged)
            weekday_risk.append(r.nutrition_risk_score)
            weekday_quality.append(r.diet_quality_score)

    weekend_avg_cal = round(sum(weekend_calories) / len(weekend_calories)) if weekend_calories else 0
    weekday_avg_cal = round(sum(weekday_calories) / len(weekday_calories)) if weekday_calories else 0
    weekend_avg_risk = round(sum(weekend_risk) / len(weekend_risk)) if weekend_risk else 0
    weekday_avg_risk = round(sum(weekday_risk) / len(weekday_risk)) if weekday_risk else 0

    # Calculate percentage difference
    if weekday_avg_cal > 0:
        pct_difference = round(((weekend_avg_cal - weekday_avg_cal) / weekday_avg_cal) * 100, 1)
    else:
        pct_difference = 0.0

    pattern_detected = pct_difference > 20.0
    weekend_risk_higher = weekend_avg_risk > weekday_avg_risk

    # --- Item 16: TIME pattern — first meal timing ---
    fl_start = datetime.combine(four_weeks_ago, dt_time.min)
    fl_end = datetime.combine(today, dt_time.max)

    food_log_result = await session.execute(
        select(AIFoodLog.logged_at).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= fl_start,
            AIFoodLog.logged_at <= fl_end,
            AIFoodLog.deleted_at.is_(None),
        ).order_by(AIFoodLog.logged_at)
    )
    food_log_rows = food_log_result.all()

    first_meal_by_date: dict[date, int] = {}
    for row in food_log_rows:
        log_date = row[0].date()
        if log_date not in first_meal_by_date:
            first_meal_by_date[log_date] = row[0].hour

    weekend_first_hours: list[int] = []
    weekday_first_hours: list[int] = []
    for d, hour in first_meal_by_date.items():
        if d.weekday() >= 5:
            weekend_first_hours.append(hour)
        else:
            weekday_first_hours.append(hour)

    weekend_avg_first_meal_hour = round(sum(weekend_first_hours) / len(weekend_first_hours), 1) if weekend_first_hours else None
    weekday_avg_first_meal_hour = round(sum(weekday_first_hours) / len(weekday_first_hours), 1) if weekday_first_hours else None

    late_weekend_meals = False
    first_meal_diff_hours = 0.0
    if weekend_avg_first_meal_hour is not None and weekday_avg_first_meal_hour is not None:
        first_meal_diff_hours = round(weekend_avg_first_meal_hour - weekday_avg_first_meal_hour, 1)
        late_weekend_meals = first_meal_diff_hours > 2.0

    # --- Item 16: QUALITY pattern — diet quality difference ---
    weekend_avg_quality = round(sum(weekend_quality) / len(weekend_quality)) if weekend_quality else 0
    weekday_avg_quality = round(sum(weekday_quality) / len(weekday_quality)) if weekday_quality else 0
    quality_drop_weekend = weekday_avg_quality - weekend_avg_quality if weekday_avg_quality > 0 else 0

    return {
        "weekend_avg_calories": weekend_avg_cal,
        "weekday_avg_calories": weekday_avg_cal,
        "weekend_avg_risk": weekend_avg_risk,
        "weekday_avg_risk": weekday_avg_risk,
        "weekend_risk_higher": weekend_risk_higher,
        "pattern_detected": pattern_detected,
        "pct_difference": pct_difference,
        "data_days": len(records),
        "weekend_days": len(weekend_calories),
        "weekday_days": len(weekday_calories),
        # Item 16: TIME patterns
        "weekend_avg_first_meal_hour": weekend_avg_first_meal_hour,
        "weekday_avg_first_meal_hour": weekday_avg_first_meal_hour,
        "first_meal_diff_hours": first_meal_diff_hours,
        "late_weekend_meals": late_weekend_meals,
        # Item 16: QUALITY patterns
        "weekend_avg_quality": weekend_avg_quality,
        "weekday_avg_quality": weekday_avg_quality,
        "quality_drop_weekend": quality_drop_weekend,
        "worse_quality_weekends": quality_drop_weekend > 10,
    }


# ---------------------------------------------------------------------------
# Chronic under-reporting detection (Item 9)
# ---------------------------------------------------------------------------

async def detect_chronic_underreporting(user_id: int, session: AsyncSession) -> dict:
    """
    Compare last 14 days of logged calories vs target.
    If average logged < 60% of target for >= 10 of 14 days -> chronic underreporting.
    Also check if meals_logged is consistently low (< 2 per day average).

    Returns:
        {
            "chronic_underreporting": bool,
            "avg_logged_pct": float,
            "days_analyzed": int,
            "days_under": int,
            "likely_not_logging": bool,
            "suggestion": str,
        }
    """
    today = date.today()
    start = today - timedelta(days=13)

    result = await session.execute(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date >= start,
            DailyNutritionAdherence.date <= today,
        )
    )
    records = list(result.scalars().all())

    if not records:
        return {
            "chronic_underreporting": False,
            "avg_logged_pct": 0.0,
            "days_analyzed": 0,
            "days_under": 0,
            "likely_not_logging": True,
            "suggestion": "No hay datos suficientes. Comienza a registrar tus comidas.",
        }

    days_under = 0
    total_pct = 0.0
    total_meals = 0

    for r in records:
        pct = (r.calories_logged / r.calories_target) if r.calories_target > 0 else 0.0
        total_pct += pct
        total_meals += r.meals_logged
        if pct < 0.60:
            days_under += 1

    days_analyzed = len(records)
    avg_logged_pct = round((total_pct / days_analyzed) * 100, 1) if days_analyzed > 0 else 0.0
    avg_meals_per_day = total_meals / days_analyzed if days_analyzed > 0 else 0.0

    chronic = days_under >= 10 and days_analyzed >= 10
    likely_not_logging = avg_meals_per_day < 2.0

    if chronic:
        suggestion = "Parece que no estas registrando todo. Intenta el registro rapido despues de cada comida."
    elif likely_not_logging:
        suggestion = "Registras pocas comidas al dia. Intenta registrar al menos desayuno, almuerzo y cena."
    else:
        suggestion = "Tu registro esta dentro de lo esperado. Sigue asi!"

    return {
        "chronic_underreporting": chronic,
        "avg_logged_pct": avg_logged_pct,
        "days_analyzed": days_analyzed,
        "days_under": days_under,
        "likely_not_logging": likely_not_logging,
        "suggestion": suggestion,
    }


# ---------------------------------------------------------------------------
# Protein minimum check (Item 8)
# ---------------------------------------------------------------------------

def _check_protein_minimum(protein_logged: int, weight_kg: float, activity_level: str = "moderate") -> dict:
    """
    Check if user meets minimum protein requirement.
    - Minimum protein = 1.2g per kg bodyweight (or 0.8g for sedentary).

    Returns:
        {
            "meets_minimum": bool,
            "protein_logged": int,
            "minimum_g": int,
            "deficit_g": int,
        }
    """
    if activity_level == "sedentary":
        min_per_kg = 0.8
    else:
        min_per_kg = 1.2

    minimum_g = int(round(min_per_kg * weight_kg))
    deficit_g = max(0, minimum_g - protein_logged)

    return {
        "meets_minimum": protein_logged >= minimum_g,
        "protein_logged": protein_logged,
        "minimum_g": minimum_g,
        "deficit_g": deficit_g,
    }


# ---------------------------------------------------------------------------
# Weight risk context (Item 139)
# ---------------------------------------------------------------------------

async def get_weight_risk_context(user_id: int, session: AsyncSession) -> dict:
    """Return weight progress context from OnboardingProfile.

    Since there is no dedicated weight-tracking table, we use the onboarding
    profile's weight_kg (current at signup) and target_weight_kg. Weekly change
    is estimated from the configured weekly_speed_kg and goal direction.
    """
    result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    profile = result.scalars().first()

    if not profile or not profile.weight_kg:
        return {
            "current_kg": None,
            "target_kg": None,
            "delta_kg": None,
            "on_track": False,
            "weekly_change_kg": 0.0,
        }

    current_kg = profile.weight_kg
    target_kg = profile.target_weight_kg or current_kg
    delta_kg = round(current_kg - target_kg, 1)
    goal = (profile.goal or "maintain").lower()
    weekly_speed = profile.weekly_speed_kg or 0.0

    if goal == "lose":
        on_track = current_kg >= target_kg  # still above target = still working
        weekly_change_kg = -abs(weekly_speed) if weekly_speed else -0.5
    elif goal == "gain":
        on_track = current_kg <= target_kg  # still below target = still working
        weekly_change_kg = abs(weekly_speed) if weekly_speed else 0.5
    else:
        on_track = abs(delta_kg) <= 2.0  # maintain: within 2 kg
        weekly_change_kg = 0.0

    return {
        "current_kg": round(current_kg, 1),
        "target_kg": round(target_kg, 1),
        "delta_kg": delta_kg,
        "on_track": on_track,
        "weekly_change_kg": round(weekly_change_kg, 2),
    }


# ---------------------------------------------------------------------------
# Exercise-nutrition correlation (Item 146)
# ---------------------------------------------------------------------------

async def detect_exercise_nutrition_correlation(
    user_id: int, session: AsyncSession
) -> dict:
    """Compare avg calories and diet quality on workout days vs non-workout days.

    Looks at the last 4 weeks (28 days). Returns whether a pattern is detected
    where nutrition quality drops on rest days.
    """
    today = date.today()
    start_date = today - timedelta(days=27)

    # Get all workout dates in the window
    wk_start = datetime.combine(start_date, dt_time.min)
    wk_end = datetime.combine(today, dt_time.max)

    workout_result = await session.execute(
        select(WorkoutLog.created_at).where(
            WorkoutLog.user_id == user_id,
            WorkoutLog.created_at >= wk_start,
            WorkoutLog.created_at <= wk_end,
        )
    )
    workout_dates: set[date] = set()
    for row in workout_result.all():
        dt_val = row[0]
        workout_dates.add(dt_val.date() if hasattr(dt_val, "date") else dt_val)

    # Get adherence records in the window
    adh_result = await session.execute(
        select(DailyNutritionAdherence).where(
            DailyNutritionAdherence.user_id == user_id,
            DailyNutritionAdherence.date >= start_date,
            DailyNutritionAdherence.date <= today,
        )
    )
    records = list(adh_result.scalars().all())

    if not records:
        return {
            "pattern_detected": False,
            "workout_day_avg_cal": 0,
            "rest_day_avg_cal": 0,
            "quality_diff": 0,
            "data_days": 0,
        }

    # Split records into workout days and rest days
    workout_cals: list[int] = []
    rest_cals: list[int] = []
    workout_quality: list[int] = []
    rest_quality: list[int] = []

    for r in records:
        if r.date in workout_dates:
            workout_cals.append(r.calories_logged)
            workout_quality.append(r.diet_quality_score)
        else:
            rest_cals.append(r.calories_logged)
            rest_quality.append(r.diet_quality_score)

    workout_avg_cal = int(round(sum(workout_cals) / len(workout_cals))) if workout_cals else 0
    rest_avg_cal = int(round(sum(rest_cals) / len(rest_cals))) if rest_cals else 0
    workout_avg_quality = int(round(sum(workout_quality) / len(workout_quality))) if workout_quality else 0
    rest_avg_quality = int(round(sum(rest_quality) / len(rest_quality))) if rest_quality else 0

    quality_diff = workout_avg_quality - rest_avg_quality

    # Pattern detected if rest day quality is notably worse (>= 10 points)
    pattern_detected = quality_diff >= 10 and len(workout_cals) >= 3 and len(rest_cals) >= 3

    return {
        "pattern_detected": pattern_detected,
        "workout_day_avg_cal": workout_avg_cal,
        "rest_day_avg_cal": rest_avg_cal,
        "workout_day_avg_quality": workout_avg_quality,
        "rest_day_avg_quality": rest_avg_quality,
        "quality_diff": quality_diff,
        "workout_days": len(workout_cals),
        "rest_days": len(rest_cals),
        "data_days": len(records),
    }


# ---------------------------------------------------------------------------
# Intervention coverage stats (Item 152)
# ---------------------------------------------------------------------------

def get_intervention_coverage_stats() -> dict:
    """Return stats about intervention template coverage.

    All interventions are served by CAUSE_MESSAGES and INTERVENTIONS dicts.
    No AI is required for any intervention type.
    """
    # Count distinct intervention severity levels
    severity_types = set(INTERVENTIONS.keys())
    # Count distinct cause-based message types
    cause_types = set(CAUSE_MESSAGES.keys())
    # Count time-aware overrides
    time_aware_types = set(TIME_AWARE_MESSAGES.keys())
    # Count rescue sequence steps
    rescue_steps = set(RESCUE_SEQUENCE.keys())

    all_types = severity_types | cause_types | time_aware_types | {f"rescue_day_{d}" for d in rescue_steps}
    total = len(all_types)

    return {
        "total_intervention_types": total,
        "template_covered": total,
        "ai_required": 0,
        "coverage_pct": 100.0,
        "breakdown": {
            "severity_levels": sorted(severity_types),
            "cause_messages": sorted(cause_types),
            "time_aware_overrides": sorted(time_aware_types),
            "rescue_sequence_days": sorted(rescue_steps),
        },
    }


# ---------------------------------------------------------------------------
# Personalized message cache (Item 153)
# ---------------------------------------------------------------------------

# In-memory cache for personalized messages per risk window
# Key: "{user_id}:{risk_level}:{primary_reason}" -> (timestamp_seconds, message_str)
_message_cache: dict[str, tuple[float, str]] = {}
_MESSAGE_CACHE_TTL = 3600  # 1 hour


def get_cached_message(user_id: int, risk_level: str, primary_reason: str) -> str | None:
    """Return a cached personalized message if fresh, else None."""
    key = f"{user_id}:{risk_level}:{primary_reason}"
    entry = _message_cache.get(key)
    if entry is None:
        return None
    cached_at, message = entry
    if (time_mod.time() - cached_at) > _MESSAGE_CACHE_TTL:
        _message_cache.pop(key, None)
        return None
    return message


def set_cached_message(user_id: int, risk_level: str, primary_reason: str, message: str) -> None:
    """Cache a personalized message for the given risk window."""
    key = f"{user_id}:{risk_level}:{primary_reason}"
    _message_cache[key] = (time_mod.time(), message)


def invalidate_message_cache(user_id: int) -> None:
    """Remove all cached messages for a user."""
    prefix = f"{user_id}:"
    keys_to_remove = [k for k in _message_cache if k.startswith(prefix)]
    for k in keys_to_remove:
        del _message_cache[k]


# ---------------------------------------------------------------------------
# Audit trail for plan changes (Item 61)
# ---------------------------------------------------------------------------

async def log_plan_change(
    user_id: int,
    old_goals: dict,
    new_goals: dict,
    session: AsyncSession,
) -> None:
    """Log when a user's nutrition goals change.

    Stores in risk_analytics_event with event_type='plan_changed' and
    metadata containing old and new values.
    """
    from .risk_analytics_service import track_risk_event

    metadata = {
        "old_calories": old_goals.get("calories"),
        "old_protein_g": old_goals.get("protein_g"),
        "old_carbs_g": old_goals.get("carbs_g"),
        "old_fat_g": old_goals.get("fat_g"),
        "new_calories": new_goals.get("calories"),
        "new_protein_g": new_goals.get("protein_g"),
        "new_carbs_g": new_goals.get("carbs_g"),
        "new_fat_g": new_goals.get("fat_g"),
    }

    try:
        await track_risk_event(
            user_id=user_id,
            event_type="plan_changed",
            metadata=metadata,
            session=session,
        )
        logger.info("Plan change logged for user_id=%d", user_id)
    except Exception as exc:
        logger.error("Failed to log plan change for user_id=%d: %s", user_id, exc)
