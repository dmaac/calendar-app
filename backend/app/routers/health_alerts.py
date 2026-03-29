"""
Health Alerts router — Deficit & Nutritional Risk Detection.

GET /api/health/alerts — Analyses the last 7 days of the user's
nutrition data and returns actionable alerts with severity levels.

Detections:
- Chronic calorie deficit (<1200 kcal for 3+ days)
- Low protein intake (<0.8 g per kg of body weight)
- Missing fruits/vegetables (no fiber-rich foods detected)
- Excessive calorie surplus (>150% of goal for 3+ days)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta
from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.ai_food_log import AIFoodLog
from ..models.user import User
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/health", tags=["health-alerts"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AlertSeverity(str, Enum):
    WARNING = "warning"
    DANGER = "danger"


class HealthAlert(BaseModel):
    code: str
    severity: AlertSeverity
    title: str
    message: str
    recommendation: str
    days_affected: int
    data: dict = {}


class HealthAlertsResponse(BaseModel):
    date: date
    analysis_window_days: int
    alerts: List[HealthAlert]
    summary: str


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

_MIN_DAILY_CALORIES = 1200
_MIN_DAILY_CALORIES_DAYS = 3          # fire alert after this many low days
_EXCESSIVE_SURPLUS_RATIO = 1.5        # 150% of goal
_EXCESSIVE_SURPLUS_DAYS = 3
_MIN_PROTEIN_PER_KG = 0.8             # grams per kg of body weight
_MIN_PROTEIN_DAYS = 3
_LOW_FIBER_THRESHOLD_G = 5.0          # below this = likely no fruits/vegs
_LOW_FIBER_DAYS = 5
_ANALYSIS_WINDOW = 7                  # days


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_user_weight(user_id: int, session: AsyncSession) -> Optional[float]:
    """Best-effort weight retrieval from profiles."""
    result = await session.execute(
        select(UserNutritionProfile.weight_kg).where(
            UserNutritionProfile.user_id == user_id,
        )
    )
    weight = result.scalar()
    if weight is not None:
        return float(weight)

    result = await session.execute(
        select(OnboardingProfile.weight_kg).where(
            OnboardingProfile.user_id == user_id,
        )
    )
    weight = result.scalar()
    if weight is not None:
        return float(weight)

    return None


async def _get_calorie_goal(user_id: int, session: AsyncSession) -> float:
    result = await session.execute(
        select(UserNutritionProfile.target_calories).where(
            UserNutritionProfile.user_id == user_id,
        )
    )
    target = result.scalar()
    if target is not None:
        return float(target)

    result = await session.execute(
        select(OnboardingProfile.daily_calories).where(
            OnboardingProfile.user_id == user_id,
        )
    )
    target = result.scalar()
    if target is not None:
        return float(target)

    return 2000.0


async def _get_daily_aggregates(
    user_id: int,
    since: date,
    until: date,
    session: AsyncSession,
) -> list[dict]:
    """
    Return per-day aggregates (calories, protein_g, fiber_g) from
    ai_food_log for each day in [since, until].
    """
    since_dt = datetime.combine(since, dt_time.min)
    until_dt = datetime.combine(until, dt_time.max)

    stmt = (
        select(
            func.date(AIFoodLog.logged_at).label("log_date"),
            func.coalesce(func.sum(AIFoodLog.calories), 0.0).label("total_calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0.0).label("total_protein_g"),
            func.coalesce(func.sum(AIFoodLog.fiber_g), 0.0).label("total_fiber_g"),
            func.count(AIFoodLog.id).label("log_count"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= since_dt,
            AIFoodLog.logged_at <= until_dt,
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(func.date(AIFoodLog.logged_at))
    )

    result = await session.execute(stmt)
    rows = result.all()

    aggregates = []
    for row in rows:
        aggregates.append({
            "date": row.log_date,
            "total_calories": float(row.total_calories),
            "total_protein_g": float(row.total_protein_g),
            "total_fiber_g": float(row.total_fiber_g),
            "log_count": int(row.log_count),
        })

    return aggregates


# ---------------------------------------------------------------------------
# Detection rules
# ---------------------------------------------------------------------------

def _detect_low_calories(
    daily_data: list[dict],
) -> Optional[HealthAlert]:
    """Detect chronic low calorie intake (<1200 kcal for 3+ days)."""
    # Only consider days where the user actually logged food
    low_days = [
        d for d in daily_data
        if d["log_count"] > 0 and d["total_calories"] < _MIN_DAILY_CALORIES
    ]

    if len(low_days) >= _MIN_DAILY_CALORIES_DAYS:
        avg_cal = round(sum(d["total_calories"] for d in low_days) / len(low_days), 0)
        return HealthAlert(
            code="low_calories",
            severity=AlertSeverity.DANGER,
            title="Ingesta calorica muy baja",
            message=(
                f"Has consumido menos de {_MIN_DAILY_CALORIES} kcal en "
                f"{len(low_days)} de los ultimos {_ANALYSIS_WINDOW} dias "
                f"(promedio: {int(avg_cal)} kcal)."
            ),
            recommendation=(
                "Consumir menos de 1200 kcal por dia puede causar perdida muscular, "
                "fatiga y deficiencias nutricionales. Consulta a un nutricionista "
                "si estas haciendo un deficit agresivo."
            ),
            days_affected=len(low_days),
            data={"avg_calories": avg_cal, "threshold": _MIN_DAILY_CALORIES},
        )

    return None


def _detect_excessive_surplus(
    daily_data: list[dict],
    goal: float,
) -> Optional[HealthAlert]:
    """Detect chronic excessive calorie surplus (>150% of goal for 3+ days)."""
    surplus_threshold = goal * _EXCESSIVE_SURPLUS_RATIO

    surplus_days = [
        d for d in daily_data
        if d["log_count"] > 0 and d["total_calories"] > surplus_threshold
    ]

    if len(surplus_days) >= _EXCESSIVE_SURPLUS_DAYS:
        avg_cal = round(sum(d["total_calories"] for d in surplus_days) / len(surplus_days), 0)
        return HealthAlert(
            code="excessive_surplus",
            severity=AlertSeverity.WARNING,
            title="Exceso calorico recurrente",
            message=(
                f"Has superado el 150% de tu meta calorica ({int(goal)} kcal) "
                f"en {len(surplus_days)} de los ultimos {_ANALYSIS_WINDOW} dias "
                f"(promedio: {int(avg_cal)} kcal)."
            ),
            recommendation=(
                "Revisa tus porciones y el tipo de alimentos que consumes. "
                "Si estas en un periodo de volumen, ajusta tu meta en el perfil."
            ),
            days_affected=len(surplus_days),
            data={"avg_calories": avg_cal, "goal": goal},
        )

    return None


def _detect_low_protein(
    daily_data: list[dict],
    weight_kg: Optional[float],
) -> Optional[HealthAlert]:
    """
    Detect low protein intake (<0.8g per kg body weight).

    If the user's weight is unknown, use a conservative 60kg default.
    """
    weight = weight_kg or 60.0
    min_protein = weight * _MIN_PROTEIN_PER_KG

    low_days = [
        d for d in daily_data
        if d["log_count"] > 0 and d["total_protein_g"] < min_protein
    ]

    if len(low_days) >= _MIN_PROTEIN_DAYS:
        avg_prot = round(sum(d["total_protein_g"] for d in low_days) / len(low_days), 1)
        return HealthAlert(
            code="low_protein",
            severity=AlertSeverity.WARNING,
            title="Proteina insuficiente",
            message=(
                f"Tu consumo de proteina ha sido bajo en {len(low_days)} de los "
                f"ultimos {_ANALYSIS_WINDOW} dias (promedio: {avg_prot}g, "
                f"recomendado: {round(min_protein, 0)}g)."
            ),
            recommendation=(
                "La proteina es esencial para mantener masa muscular y "
                "sensacion de saciedad. Incluye pollo, huevos, legumbres, "
                "yogur o suplementos de proteina."
            ),
            days_affected=len(low_days),
            data={
                "avg_protein_g": avg_prot,
                "recommended_g": round(min_protein, 0),
                "weight_kg_used": weight,
            },
        )

    return None


def _detect_low_fiber(
    daily_data: list[dict],
) -> Optional[HealthAlert]:
    """
    Detect potential lack of fruits/vegetables by checking fiber intake.

    A very low fiber count signals the user may not be eating enough
    fresh produce.
    """
    low_fiber_days = [
        d for d in daily_data
        if d["log_count"] > 0 and d["total_fiber_g"] < _LOW_FIBER_THRESHOLD_G
    ]

    if len(low_fiber_days) >= _LOW_FIBER_DAYS:
        avg_fiber = round(
            sum(d["total_fiber_g"] for d in low_fiber_days) / len(low_fiber_days), 1
        )
        return HealthAlert(
            code="low_fiber",
            severity=AlertSeverity.WARNING,
            title="Poca fibra / frutas y verduras",
            message=(
                f"Tu consumo de fibra ha sido muy bajo en {len(low_fiber_days)} "
                f"de los ultimos {_ANALYSIS_WINDOW} dias (promedio: {avg_fiber}g)."
            ),
            recommendation=(
                "La fibra proviene de frutas, verduras, legumbres y cereales integrales. "
                "Intenta agregar al menos 2 porciones de fruta y verdura al dia."
            ),
            days_affected=len(low_fiber_days),
            data={"avg_fiber_g": avg_fiber, "threshold_g": _LOW_FIBER_THRESHOLD_G},
        )

    return None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/alerts", response_model=HealthAlertsResponse)
async def get_health_alerts(
    days: int = Query(
        _ANALYSIS_WINDOW,
        ge=3,
        le=30,
        description="Number of days to analyse (default 7)",
    ),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Analyse the user's recent nutrition data and return health alerts.

    Each alert includes a severity (``warning`` or ``danger``), a
    human-readable message, and a concrete recommendation.
    """
    today = date.today()
    since = today - timedelta(days=days - 1)
    user_id: int = current_user.id  # type: ignore[assignment]

    try:
        # Fetch required context in parallel-style (all are DB queries)
        daily_data = await _get_daily_aggregates(user_id, since, today, session)
        weight_kg = await _get_user_weight(user_id, session)
        calorie_goal = await _get_calorie_goal(user_id, session)
    except Exception as e:
        logger.exception("Error fetching health alert data for user %s", user_id)
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail="Failed to compute health alerts",
        )

    # Run all detection rules
    alerts: List[HealthAlert] = []

    low_cal = _detect_low_calories(daily_data)
    if low_cal:
        alerts.append(low_cal)

    surplus = _detect_excessive_surplus(daily_data, calorie_goal)
    if surplus:
        alerts.append(surplus)

    low_prot = _detect_low_protein(daily_data, weight_kg)
    if low_prot:
        alerts.append(low_prot)

    low_fib = _detect_low_fiber(daily_data)
    if low_fib:
        alerts.append(low_fib)

    # Sort: danger first, then warning
    severity_order = {AlertSeverity.DANGER: 0, AlertSeverity.WARNING: 1}
    alerts.sort(key=lambda a: severity_order.get(a.severity, 99))

    # Build human-readable summary
    if not alerts:
        summary = "Tu nutricion se ve bien! Sigue asi."
    else:
        danger_count = sum(1 for a in alerts if a.severity == AlertSeverity.DANGER)
        warning_count = sum(1 for a in alerts if a.severity == AlertSeverity.WARNING)
        parts = []
        if danger_count:
            parts.append(f"{danger_count} alerta(s) critica(s)")
        if warning_count:
            parts.append(f"{warning_count} advertencia(s)")
        summary = f"Se detectaron {', '.join(parts)} en los ultimos {days} dias."

    return HealthAlertsResponse(
        date=today,
        analysis_window_days=days,
        alerts=alerts,
        summary=summary,
    )
