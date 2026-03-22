"""
Exercise Calorie Balance router.

GET /api/calories/net — Returns today's net calorie balance:
    consumed (food logs) - burned (workouts) = net
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.ai_food_log import AIFoodLog
from ..models.user import User
from ..models.workout import WorkoutLog, WorkoutType
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile
from ..services.workout_service import estimate_calories as met_estimate
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calories", tags=["calories"])


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class NetCaloriesResponse(BaseModel):
    """Daily calorie balance breakdown."""

    date: date
    consumed: float
    burned: float
    net: float
    goal: float
    remaining: float
    deficit_or_surplus: str  # "deficit" | "surplus" | "on_target"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_consumed_calories(
    user_id: int,
    target_date: date,
    session: AsyncSession,
) -> float:
    """Sum calories from all AIFoodLog entries for the given day."""
    day_start = datetime.combine(target_date, dt_time.min)
    day_end = datetime.combine(target_date, dt_time.max)

    result = await session.execute(
        select(func.coalesce(func.sum(AIFoodLog.calories), 0.0)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
        )
    )
    return float(result.scalar())


async def _get_burned_calories(
    user_id: int,
    target_date: date,
    session: AsyncSession,
    weight_kg: Optional[float] = None,
) -> float:
    """
    Sum calories burned from WorkoutLog entries for the given day.

    If the workout already has ``calories_burned`` recorded (e.g. from
    a wearable), use that value.  Otherwise fall back to MET-based
    estimation using the user's weight.
    """
    day_start = datetime.combine(target_date, dt_time.min)
    day_end = datetime.combine(target_date, dt_time.max)

    stmt = select(WorkoutLog).where(
        WorkoutLog.user_id == user_id,
        WorkoutLog.created_at >= day_start,
        WorkoutLog.created_at <= day_end,
    )
    result = await session.exec(stmt)
    workouts = list(result.all())

    total_burned = 0.0
    for w in workouts:
        if w.calories_burned is not None and w.calories_burned > 0:
            total_burned += w.calories_burned
        else:
            # MET-based estimation — requires weight
            w_kg = weight_kg or 70.0  # safe default
            total_burned += met_estimate(w.workout_type, w.duration_min, w_kg)

    return round(total_burned, 1)


async def _get_calorie_goal(
    user_id: int,
    session: AsyncSession,
) -> float:
    """
    Retrieve the user's daily calorie target.

    Priority:
      1. UserNutritionProfile.target_calories
      2. OnboardingProfile.daily_calories
      3. Hardcoded default: 2000 kcal
    """
    # Try nutrition profile first
    result = await session.exec(
        select(UserNutritionProfile.target_calories).where(
            UserNutritionProfile.user_id == user_id,
        )
    )
    target = result.first()
    if target is not None:
        return float(target)

    # Fallback to onboarding profile
    result = await session.exec(
        select(OnboardingProfile.daily_calories).where(
            OnboardingProfile.user_id == user_id,
        )
    )
    target = result.first()
    if target is not None:
        return float(target)

    return 2000.0


async def _get_user_weight(
    user_id: int,
    session: AsyncSession,
) -> Optional[float]:
    """Best-effort retrieval of the user's weight in kg."""
    # Nutrition profile
    result = await session.exec(
        select(UserNutritionProfile.weight_kg).where(
            UserNutritionProfile.user_id == user_id,
        )
    )
    weight = result.first()
    if weight is not None:
        return float(weight)

    # Onboarding fallback
    result = await session.exec(
        select(OnboardingProfile.weight_kg).where(
            OnboardingProfile.user_id == user_id,
        )
    )
    weight = result.first()
    if weight is not None:
        return float(weight)

    return None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/net", response_model=NetCaloriesResponse)
async def get_net_calories(
    target_date: Optional[date] = Query(
        None,
        description="Date to calculate for (defaults to today)",
    ),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Calculate the net calorie balance for the given day.

    **net_calories** = consumed - burned

    Returns consumed, burned, net, the user's calorie goal,
    how many calories remain to reach the goal, and whether
    the user is in deficit, surplus, or on target.
    """
    target = target_date or date.today()
    user_id: int = current_user.id  # type: ignore[assignment]

    try:
        weight_kg = await _get_user_weight(user_id, session)
        consumed = await _get_consumed_calories(user_id, target, session)
        burned = await _get_burned_calories(user_id, target, session, weight_kg)
        goal = await _get_calorie_goal(user_id, session)
    except Exception as e:
        logger.exception("Error computing net calories for user %s", user_id)
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail="Failed to compute calorie balance",
        )

    net = round(consumed - burned, 1)
    remaining = round(goal - net, 1)

    # Classify the balance
    tolerance = 50.0  # +/- 50 kcal is "on target"
    if net < goal - tolerance:
        classification = "deficit"
    elif net > goal + tolerance:
        classification = "surplus"
    else:
        classification = "on_target"

    return NetCaloriesResponse(
        date=target,
        consumed=round(consumed, 1),
        burned=round(burned, 1),
        net=net,
        goal=round(goal, 1),
        remaining=remaining,
        deficit_or_surplus=classification,
    )
