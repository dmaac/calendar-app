import logging
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.user import User
from ..models.activity import Activity, ActivityCreate, ActivityRead, ActivityUpdate
from ..services.activity_service import ActivityService
from ..services.streak_service import StreakService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/activities", tags=["activities"])


@router.post("/", response_model=ActivityRead)
async def create_activity(
    activity_create: ActivityCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    activity_service = ActivityService(session)

    # Validate that end_time is after start_time
    if activity_create.end_time <= activity_create.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End time must be after start time"
        )

    try:
        activity = await activity_service.create_activity(activity_create, current_user.id)
        return activity
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/", response_model=List[ActivityRead])
async def get_user_activities(
    start_date: datetime = Query(None, description="Filter activities from this date"),
    end_date: datetime = Query(None, description="Filter activities until this date"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    activity_service = ActivityService(session)

    try:
        if start_date and end_date:
            activities = await activity_service.get_user_activities_by_date_range(
                current_user.id, start_date, end_date
            )
        else:
            activities = await activity_service.get_user_activities(current_user.id)
    except Exception as e:
        logger.exception("Error fetching activities for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve activities",
        )

    return activities


@router.get("/{activity_id}", response_model=ActivityRead)
async def get_activity(
    activity_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    activity_service = ActivityService(session)
    activity = await activity_service.get_activity_by_id(activity_id)

    if not activity or activity.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    return activity


@router.put("/{activity_id}", response_model=ActivityRead)
async def update_activity(
    activity_id: int,
    activity_update: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    activity_service = ActivityService(session)

    # Validate time constraint if both times are being updated
    if (activity_update.start_time and activity_update.end_time and
        activity_update.end_time <= activity_update.start_time):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End time must be after start time"
        )

    try:
        activity = await activity_service.update_activity(activity_id, activity_update, current_user.id)

        if not activity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found"
            )

        return activity
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    activity_service = ActivityService(session)

    if not await activity_service.delete_activity(activity_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    return {"message": "Activity deleted successfully"}


@router.get("/streak", tags=["activities"])
async def get_streak(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return current streak and all-time max streak (consecutive days with food logs)."""
    try:
        streak_service = StreakService(session)
        return await streak_service.calculate_streak(current_user.id)
    except Exception as e:
        logger.exception("Error calculating streak for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to calculate streak",
        )


@router.get("/weekly-summary", tags=["activities"])
async def get_weekly_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return weekly summary: avg calories, active days, best day."""
    try:
        streak_service = StreakService(session)
        return await streak_service.get_weekly_summary(current_user.id)
    except Exception as e:
        logger.exception("Error fetching weekly summary for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve weekly summary",
        )
