import logging
from typing import List, Optional
from datetime import datetime, date as date_type
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from ..core.database import get_session
from ..core.cache import cache_delete, daily_summary_key
from ..models.user import User
from ..models.workout import WorkoutLogCreate, WorkoutLogRead, WorkoutSummary, WorkoutType
from ..models.onboarding_profile import OnboardingProfile
from ..services.workout_service import WorkoutService, estimate_calories
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


@router.post("/", response_model=WorkoutLogRead, status_code=status.HTTP_201_CREATED)
async def log_workout(
    data: WorkoutLogCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        # Fetch user weight for MET-based calorie estimation
        weight_kg: float | None = None
        result = await session.execute(
            select(OnboardingProfile.weight_kg).where(
                OnboardingProfile.user_id == current_user.id,
            )
        )
        weight_val = result.scalar()
        if weight_val is not None:
            weight_kg = float(weight_val)

        service = WorkoutService(session)
        workout = await service.log_workout(current_user.id, data, weight_kg=weight_kg)

        # Invalidate dashboard cache so calorie ring reflects new exercise
        today_str = date_type.today().isoformat()
        try:
            await cache_delete(daily_summary_key(current_user.id, today_str))
        except Exception:
            pass  # cache failure is non-critical

        return workout
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.exception("Error logging workout for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to log workout",
        )


@router.get("/", response_model=List[WorkoutLogRead])
async def get_workouts(
    date_from: Optional[datetime] = Query(None, description="Filter workouts from this date"),
    date_to: Optional[datetime] = Query(None, description="Filter workouts until this date"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        service = WorkoutService(session)
        workouts = await service.get_workouts(current_user.id, date_from, date_to)
        return workouts
    except Exception as e:
        logger.exception("Error fetching workouts for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve workouts",
        )


@router.get("/summary", response_model=WorkoutSummary)
async def get_workout_summary(
    days: int = Query(7, ge=1, le=365, description="Number of days to summarize"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        service = WorkoutService(session)
        summary = await service.get_workout_summary(current_user.id, days)
        return summary
    except Exception as e:
        logger.exception("Error computing workout summary for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute workout summary",
        )


@router.get("/estimate-calories")
async def get_calorie_estimate(
    workout_type: WorkoutType = Query(..., description="Type of workout"),
    duration_min: int = Query(..., ge=1, le=1440, description="Duration in minutes (1-1440)"),
    weight_kg: float = Query(..., ge=20, le=500, description="Body weight in kg (20-500)"),
    current_user: User = Depends(get_current_user),
):
    calories = estimate_calories(workout_type, duration_min, weight_kg)
    return {"estimated_calories": calories, "workout_type": workout_type, "duration_min": duration_min}


@router.delete("/{workout_id}")
async def delete_workout(
    workout_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    service = WorkoutService(session)
    if not await service.delete_workout(workout_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found",
        )

    # Invalidate dashboard cache
    today_str = date_type.today().isoformat()
    try:
        await cache_delete(daily_summary_key(current_user.id, today_str))
    except Exception:
        pass

    return {"message": "Workout deleted successfully"}
