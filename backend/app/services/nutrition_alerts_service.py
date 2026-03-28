"""
Nutrition Alerts Service — Daily alert evaluation.

Evaluates the user's current day against their nutrition goals and generates
actionable alerts with severity levels, icons, and deep-link actions.

Alert levels (ordered by priority):
- CRITICAL: Requires immediate attention (e.g. 7+ days without logging)
- DANGER:   Significant risk (e.g. extreme fat/calorie overshoot)
- WARNING:  Moderate concern (e.g. low protein, inactivity gap)
- INFO:     Gentle nudges (e.g. hydration reminder, streak at risk)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class NutritionAlert(BaseModel):
    level: str  # critical | danger | warning | info
    title: str
    message: str
    icon: str
    color: str  # hex color for frontend rendering
    action_label: str
    action_route: str


# Level -> default color mapping for frontend
_LEVEL_COLORS = {
    "info": "#3B82F6",       # blue
    "warning": "#F59E0B",    # amber
    "danger": "#EF4444",     # red
    "critical": "#DC2626",   # dark red
}


# ---------------------------------------------------------------------------
# Goal helpers
# ---------------------------------------------------------------------------

async def _get_goals(user_id: int, session: AsyncSession) -> dict:
    """
    Retrieve the user's daily macro goals.

    Priority: UserNutritionProfile > OnboardingProfile > sensible defaults.
    Returns dict with keys: calories, protein_g, fat_g, carbs_g.
    """
    result = await session.execute(
        select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id,
        )
    )
    profile = result.scalars().first()
    if profile is not None:
        return {
            "calories": float(profile.target_calories),
            "protein_g": float(profile.target_protein_g),
            "fat_g": float(profile.target_fat_g),
            "carbs_g": float(profile.target_carbs_g),
        }

    result = await session.execute(
        select(OnboardingProfile).where(
            OnboardingProfile.user_id == user_id,
        )
    )
    onboarding = result.scalars().first()
    if onboarding is not None and onboarding.daily_calories is not None:
        return {
            "calories": float(onboarding.daily_calories),
            "protein_g": float(onboarding.daily_protein_g or 150),
            "fat_g": float(onboarding.daily_fats_g or 65),
            "carbs_g": float(onboarding.daily_carbs_g or 250),
        }

    return {"calories": 2000.0, "protein_g": 150.0, "fat_g": 65.0, "carbs_g": 250.0}


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

async def _days_since_last_log(user_id: int, session: AsyncSession) -> Optional[int]:
    """Return number of days since the user's most recent food log, or None if never logged."""
    result = await session.execute(
        select(func.max(AIFoodLog.logged_at)).where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
    )
    last_logged_at = result.scalar()
    if last_logged_at is None:
        return None
    delta = date.today() - last_logged_at.date()
    return delta.days


async def _has_logged_today(user_id: int, session: AsyncSession) -> bool:
    today_start = datetime.combine(date.today(), dt_time.min)
    today_end = datetime.combine(date.today(), dt_time.max)
    result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    return (result.scalar() or 0) > 0


async def _today_totals(user_id: int, session: AsyncSession) -> dict:
    """Aggregate today's food log totals."""
    today_start = datetime.combine(date.today(), dt_time.min)
    today_end = datetime.combine(date.today(), dt_time.max)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0.0).label("calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0.0).label("protein_g"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0.0).label("fat_g"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0.0).label("carbs_g"),
            func.coalesce(func.sum(AIFoodLog.sugar_g), 0.0).label("sugar_g"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    row = result.one()
    return {
        "calories": float(row.calories),
        "protein_g": float(row.protein_g),
        "fat_g": float(row.fat_g),
        "carbs_g": float(row.carbs_g),
        "sugar_g": float(row.sugar_g),
    }


async def _today_water_ml(user_id: int, session: AsyncSession) -> float:
    """Return today's water intake in ml from DailyNutritionSummary."""
    result = await session.execute(
        select(DailyNutritionSummary.water_ml).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == date.today(),
        )
    )
    water = result.scalar()
    return float(water) if water is not None else 0.0


async def _current_streak(user_id: int, session: AsyncSession) -> int:
    """Lightweight streak: count consecutive days ending yesterday with at least 1 log."""
    today = date.today()
    streak = 0
    check_date = today - timedelta(days=1)
    while True:
        start = datetime.combine(check_date, dt_time.min)
        end = datetime.combine(check_date, dt_time.max)
        result = await session.execute(
            select(func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= start,
                AIFoodLog.logged_at <= end,
                AIFoodLog.deleted_at.is_(None),
            )
        )
        if (result.scalar() or 0) == 0:
            break
        streak += 1
        check_date -= timedelta(days=1)
    return streak


# ---------------------------------------------------------------------------
# Alert evaluation
# ---------------------------------------------------------------------------

async def evaluate_daily_alerts(
    user_id: int,
    session: AsyncSession,
) -> list[NutritionAlert]:
    """
    Evaluate all nutrition alert rules for the given user and return
    a list of alerts sorted by severity (critical first).
    """
    alerts: list[NutritionAlert] = []

    goals = await _get_goals(user_id, session)
    days_inactive = await _days_since_last_log(user_id, session)
    logged_today = await _has_logged_today(user_id, session)
    totals = await _today_totals(user_id, session)
    water = await _today_water_ml(user_id, session)
    now = datetime.now()

    # ------------------------------------------------------------------
    # CRITICAL: 7+ days without any food log
    # ------------------------------------------------------------------
    if days_inactive is not None and days_inactive >= 7:
        alerts.append(NutritionAlert(
            level="critical",
            title="Llevas mucho sin registrar",
            message=f"Han pasado {days_inactive} dias sin registrar comida. Tu plan nutricional necesita datos para funcionar.",
            icon="alert-circle",
            color=_LEVEL_COLORS["critical"],
            action_label="Registrar comida",
            action_route="/log",
        ))
    elif days_inactive is None:
        # Never logged at all
        alerts.append(NutritionAlert(
            level="critical",
            title="Aun no has registrado comida",
            message="Registra tu primera comida para que podamos darte recomendaciones personalizadas.",
            icon="camera",
            color=_LEVEL_COLORS["critical"],
            action_label="Escanear comida",
            action_route="/scan",
        ))

    # ------------------------------------------------------------------
    # DANGER: Fat > 200% of goal (e.g. pure oil)
    # ------------------------------------------------------------------
    if logged_today and goals["fat_g"] > 0:
        fat_ratio = totals["fat_g"] / goals["fat_g"]
        if fat_ratio > 2.0:
            alerts.append(NutritionAlert(
                level="danger",
                title="Grasa extremadamente alta",
                message=f"Llevas {int(totals['fat_g'])}g de grasa hoy — mas del doble de tu meta ({int(goals['fat_g'])}g). Revisa tus alimentos.",
                icon="alert-triangle",
                color=_LEVEL_COLORS["danger"],
                action_label="Ver detalle",
                action_route="/dashboard",
            ))

    # ------------------------------------------------------------------
    # DANGER: Calories > 150% of goal
    # ------------------------------------------------------------------
    if logged_today and goals["calories"] > 0:
        cal_ratio = totals["calories"] / goals["calories"]
        if cal_ratio > 1.5:
            alerts.append(NutritionAlert(
                level="danger",
                title="Exceso calorico importante",
                message=f"Llevas {int(totals['calories'])} kcal hoy — superas tu meta de {int(goals['calories'])} kcal en un {int((cal_ratio - 1) * 100)}%.",
                icon="trending-up",
                color=_LEVEL_COLORS["danger"],
                action_label="Ver resumen",
                action_route="/dashboard",
            ))

    # ------------------------------------------------------------------
    # DANGER: > 80% of today's calories come from fat
    # ------------------------------------------------------------------
    if logged_today and totals["calories"] > 0:
        fat_calories = totals["fat_g"] * 9
        fat_pct = fat_calories / totals["calories"]
        if fat_pct > 0.80:
            alerts.append(NutritionAlert(
                level="danger",
                title="Demasiada grasa en tu dieta hoy",
                message=f"El {int(fat_pct * 100)}% de tus calorias hoy provienen de grasa. Intenta equilibrar con proteina y carbohidratos.",
                icon="pie-chart",
                color=_LEVEL_COLORS["danger"],
                action_label="Ver macros",
                action_route="/dashboard",
            ))

    # ------------------------------------------------------------------
    # DANGER: > 80% of today's calories come from sugar
    # ------------------------------------------------------------------
    if logged_today and totals["calories"] > 0:
        sugar_calories = totals["sugar_g"] * 4
        sugar_pct = sugar_calories / totals["calories"]
        if sugar_pct > 0.80:
            alerts.append(NutritionAlert(
                level="danger",
                title="Exceso de azucar",
                message=f"El {int(sugar_pct * 100)}% de tus calorias hoy provienen de azucar. Reemplaza bebidas azucaradas y dulces por opciones mas nutritivas.",
                icon="alert-triangle",
                color=_LEVEL_COLORS["danger"],
                action_label="Ver alternativas",
                action_route="/foods?category=healthy",
            ))

    # ------------------------------------------------------------------
    # WARNING: 3-6 days without logging
    # ------------------------------------------------------------------
    if days_inactive is not None and 3 <= days_inactive < 7:
        alerts.append(NutritionAlert(
            level="warning",
            title="Llevas dias sin registrar",
            message=f"Han pasado {days_inactive} dias sin registrar comida. La consistencia es clave para alcanzar tus metas.",
            icon="clock",
            color=_LEVEL_COLORS["warning"],
            action_label="Registrar ahora",
            action_route="/log",
        ))

    # ------------------------------------------------------------------
    # WARNING: Protein < 30% of goal
    # ------------------------------------------------------------------
    if logged_today and goals["protein_g"] > 0:
        protein_ratio = totals["protein_g"] / goals["protein_g"]
        if protein_ratio < 0.30:
            alerts.append(NutritionAlert(
                level="warning",
                title="Proteina muy baja",
                message=f"Solo llevas {int(totals['protein_g'])}g de proteina hoy — menos del 30% de tu meta ({int(goals['protein_g'])}g).",
                icon="arrow-down",
                color=_LEVEL_COLORS["warning"],
                action_label="Ver alimentos ricos en proteina",
                action_route="/foods?category=protein",
            ))

    # ------------------------------------------------------------------
    # WARNING: Calories < 500 kcal after 8pm
    # ------------------------------------------------------------------
    if logged_today and now.hour >= 20 and totals["calories"] < 500:
        alerts.append(NutritionAlert(
            level="warning",
            title="Calorias muy bajas hoy",
            message=f"Son las {now.strftime('%H:%M')} y solo llevas {int(totals['calories'])} kcal. Comer muy poco puede afectar tu energia y metabolismo.",
            icon="battery-low",
            color=_LEVEL_COLORS["warning"],
            action_label="Registrar comida",
            action_route="/log",
        ))

    # ------------------------------------------------------------------
    # INFO: No water logged after 2pm
    # ------------------------------------------------------------------
    if now.hour >= 14 and water == 0.0:
        alerts.append(NutritionAlert(
            level="info",
            title="No has registrado agua hoy",
            message="Mantenerte hidratado es importante. Registra tu consumo de agua para hacer seguimiento.",
            icon="droplet",
            color=_LEVEL_COLORS["info"],
            action_label="Registrar agua",
            action_route="/water",
        ))

    # ------------------------------------------------------------------
    # INFO: Streak at risk (has a streak but hasn't logged today)
    # ------------------------------------------------------------------
    if not logged_today and days_inactive is not None and days_inactive <= 1:
        streak = await _current_streak(user_id, session)
        if streak >= 2:
            alerts.append(NutritionAlert(
                level="info",
                title="Tu racha esta en riesgo",
                message=f"Llevas {streak} dias consecutivos registrando. No pierdas tu racha — registra algo hoy.",
                icon="zap",
                color=_LEVEL_COLORS["info"],
                action_label="Mantener racha",
                action_route="/scan",
            ))

    # Sort by severity priority
    severity_order = {"critical": 0, "danger": 1, "warning": 2, "info": 3}
    alerts.sort(key=lambda a: severity_order.get(a.level, 99))

    return alerts
