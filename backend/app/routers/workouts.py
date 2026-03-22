from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.user import User
from ..models.workout import WorkoutLogCreate, WorkoutLogRead, WorkoutSummary, WorkoutType
from ..services.workout_service import WorkoutService, estimate_calories
from .auth import get_current_user

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


@router.post("/", response_model=WorkoutLogRead, status_code=status.HTTP_201_CREATED)
async def log_workout(
    data: WorkoutLogCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    service = WorkoutService(session)
    workout = await service.log_workout(current_user.id, data)
    return workout


@router.get("/", response_model=List[WorkoutLogRead])
async def get_workouts(
    date_from: Optional[datetime] = Query(None, description="Filter workouts from this date"),
    date_to: Optional[datetime] = Query(None, description="Filter workouts until this date"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    service = WorkoutService(session)
    workouts = await service.get_workouts(current_user.id, date_from, date_to)
    return workouts


@router.get("/summary", response_model=WorkoutSummary)
async def get_workout_summary(
    days: int = Query(7, ge=1, le=365, description="Number of days to summarize"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    service = WorkoutService(session)
    summary = await service.get_workout_summary(current_user.id, days)
    return summary


@router.get("/estimate-calories")
async def get_calorie_estimate(
    workout_type: WorkoutType = Query(..., description="Type of workout"),
    duration_min: int = Query(..., ge=1, description="Duration in minutes"),
    weight_kg: float = Query(..., gt=0, description="Body weight in kg"),
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
    return {"message": "Workout deleted successfully"}
