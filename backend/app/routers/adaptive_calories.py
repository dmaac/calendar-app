"""
Adaptive Calorie Target router — Intelligent metabolic adjustment endpoints.

Endpoints:
  GET  /api/nutrition/adaptive-target       — Get current recommendation
  POST /api/nutrition/adaptive-target/apply  — Apply the recommended adjustment
  POST /api/nutrition/adaptive-target/dismiss — Dismiss the recommendation
  GET  /api/nutrition/adaptive-target/history — Adjustment history
  POST /api/nutrition/weight                 — Log a weight entry
  GET  /api/nutrition/weight                 — Weight history
  GET  /api/nutrition/weight/chart           — Weight + predicted trajectory (chart data)
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.calorie_adjustment import (
    AdaptiveTargetResponse,
    ApplyAdjustmentResponse,
    CalorieAdjustmentRead,
    WeightHistoryResponse,
    WeightLogCreate,
    WeightLogRead,
)
from ..models.user import User
from ..services.adaptive_calorie_service import AdaptiveCalorieService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/nutrition", tags=["adaptive-calories"])


# ---------------------------------------------------------------------------
# Weight logging
# ---------------------------------------------------------------------------

@router.post("/weight", response_model=WeightLogRead, status_code=status.HTTP_201_CREATED)
async def log_weight(
    data: WeightLogCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Record a weight measurement.

    If an entry already exists for the same date, it is updated.
    The user's nutrition profile weight is also updated to stay current.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = AdaptiveCalorieService(session)

    try:
        entry = await service.log_weight(user_id, data)
        return WeightLogRead(
            id=entry.id,
            date=entry.date,
            weight_kg=entry.weight_kg,
            source=entry.source,
            notes=entry.notes,
            created_at=entry.created_at,
        )
    except Exception as e:
        logger.exception("Error logging weight for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo registrar el peso. Intenta de nuevo.",
        )


@router.get("/weight", response_model=list[WeightLogRead])
async def get_weight_history(
    days: int = Query(default=90, ge=7, le=365, description="Number of days of history"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get weight history for the authenticated user.

    Returns entries sorted by date ascending.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = AdaptiveCalorieService(session)

    entries = await service.get_weight_history(user_id, days=days)
    return [
        WeightLogRead(
            id=e.id,
            date=e.date,
            weight_kg=e.weight_kg,
            source=e.source,
            notes=e.notes,
            created_at=e.created_at,
        )
        for e in entries
    ]


@router.get("/weight/chart", response_model=WeightHistoryResponse)
async def get_weight_chart_data(
    weeks: int = Query(default=4, ge=1, le=52, description="Number of weeks of data"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get weight history with predicted trajectory for charting.

    Returns actual weight entries, predicted weight based on calorie intake,
    current weight, target weight, and 4-week change.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = AdaptiveCalorieService(session)

    try:
        data = await service.get_weight_with_predictions(user_id, weeks=weeks)
        return WeightHistoryResponse(**data)
    except Exception as e:
        logger.exception("Error fetching weight chart data for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudieron obtener los datos del grafico.",
        )


# ---------------------------------------------------------------------------
# Adaptive calorie target
# ---------------------------------------------------------------------------

@router.get("/adaptive-target", response_model=AdaptiveTargetResponse)
async def get_adaptive_target(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Calculate the adaptive calorie target recommendation.

    Analyzes the user's weight trajectory over the last 2-4 weeks
    and compares it against predicted weight from calorie intake.
    Returns a recommendation to adjust, maintain, or stay the course.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = AdaptiveCalorieService(session)

    try:
        result = await service.calculate_adjustment(user_id)
        return result
    except Exception as e:
        logger.exception("Error calculating adaptive target for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo calcular el objetivo adaptativo.",
        )


@router.post("/adaptive-target/apply", response_model=ApplyAdjustmentResponse)
async def apply_adaptive_target(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Apply the most recent pending calorie adjustment.

    Updates the user's nutrition profile with the new calorie target
    and proportionally adjusts macronutrient targets.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = AdaptiveCalorieService(session)

    try:
        result = await service.apply_adjustment(user_id)
        return result
    except Exception as e:
        logger.exception("Error applying adaptive target for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo aplicar el ajuste. Intenta de nuevo.",
        )


@router.post("/adaptive-target/dismiss")
async def dismiss_adaptive_target(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Dismiss the current pending adjustment.

    The system will re-evaluate next week with fresh data.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = AdaptiveCalorieService(session)

    try:
        result = await service.dismiss_adjustment(user_id)
        return result
    except Exception as e:
        logger.exception("Error dismissing adaptive target for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo descartar el ajuste.",
        )


@router.get("/adaptive-target/history", response_model=list[CalorieAdjustmentRead])
async def get_adjustment_history(
    limit: int = Query(default=12, ge=1, le=52, description="Number of records"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get the history of calorie adjustments for the authenticated user.

    Returns the most recent adjustments, useful for showing the
    adjustment timeline and understanding metabolic adaptation.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = AdaptiveCalorieService(session)

    adjustments = await service.get_adjustment_history(user_id, limit=limit)
    return [
        CalorieAdjustmentRead(
            id=a.id,
            week_start=a.week_start,
            week_end=a.week_end,
            predicted_weight=a.predicted_weight,
            actual_weight=a.actual_weight,
            weight_delta=a.weight_delta,
            previous_target=a.previous_target,
            new_target=a.new_target,
            adjustment_kcal=a.adjustment_kcal,
            adjustment_reason=a.adjustment_reason,
            trend=a.trend,
            applied=a.applied,
            applied_at=a.applied_at,
            dismissed=a.dismissed,
            created_at=a.created_at,
        )
        for a in adjustments
    ]
