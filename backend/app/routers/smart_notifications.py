"""
Smart Notifications router.

GET   /api/smart-notifications/evaluate      -- Run all rules, return intents
GET   /api/smart-notifications/meal-times    -- Predicted meal times
GET   /api/smart-notifications/preferences   -- Get user notification preferences
PUT   /api/smart-notifications/preferences   -- Update preferences
POST  /api/smart-notifications/send-test     -- Send a test notification
POST  /api/smart-notifications/dispatch      -- Evaluate + send push notifications
POST  /api/smart-notifications/dispatch-all  -- Batch dispatch for all users (admin)
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..services.notification_service import NotificationService
from ..services.smart_notification_service import SmartNotificationService
from .auth import get_current_user
from .admin import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/smart-notifications", tags=["smart-notifications"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class NotificationIntentResponse(BaseModel):
    type: str
    title: str
    body: str
    scheduled_for: Optional[str] = None
    data: dict = {}
    priority: int


class EvaluateResponse(BaseModel):
    notifications_enabled: bool
    intents: List[NotificationIntentResponse]
    count: int


class MealTimePrediction(BaseModel):
    meal_type: str
    predicted_time: Optional[str] = None  # HH:MM or null


class PredictedMealTimesResponse(BaseModel):
    predictions: List[MealTimePrediction]


class NotificationPreferencesResponse(BaseModel):
    notifications_enabled: bool
    meal_reminders_enabled: bool
    breakfast_reminder_hour: int
    breakfast_reminder_minute: int
    lunch_reminder_hour: int
    lunch_reminder_minute: int
    dinner_reminder_hour: int
    dinner_reminder_minute: int
    snack_reminder_hour: int
    snack_reminder_minute: int
    use_predicted_times: bool
    reminder_lead_minutes: int
    evening_summary_enabled: bool
    evening_summary_hour: int
    evening_summary_minute: int
    streak_alerts_enabled: bool
    streak_risk_hour: int
    streak_risk_minute: int
    streak_celebrations_enabled: bool
    inactivity_nudge_enabled: bool
    inactivity_days_threshold: int
    water_reminders_enabled: bool
    water_reminder_interval_hours: int


class UpdatePreferencesRequest(BaseModel):
    notifications_enabled: Optional[bool] = None
    meal_reminders_enabled: Optional[bool] = None
    breakfast_reminder_hour: Optional[int] = Field(default=None, ge=0, le=23)
    breakfast_reminder_minute: Optional[int] = Field(default=None, ge=0, le=59)
    lunch_reminder_hour: Optional[int] = Field(default=None, ge=0, le=23)
    lunch_reminder_minute: Optional[int] = Field(default=None, ge=0, le=59)
    dinner_reminder_hour: Optional[int] = Field(default=None, ge=0, le=23)
    dinner_reminder_minute: Optional[int] = Field(default=None, ge=0, le=59)
    snack_reminder_hour: Optional[int] = Field(default=None, ge=0, le=23)
    snack_reminder_minute: Optional[int] = Field(default=None, ge=0, le=59)
    use_predicted_times: Optional[bool] = None
    reminder_lead_minutes: Optional[int] = Field(default=None, ge=5, le=60)
    evening_summary_enabled: Optional[bool] = None
    evening_summary_hour: Optional[int] = Field(default=None, ge=0, le=23)
    evening_summary_minute: Optional[int] = Field(default=None, ge=0, le=59)
    streak_alerts_enabled: Optional[bool] = None
    streak_risk_hour: Optional[int] = Field(default=None, ge=0, le=23)
    streak_risk_minute: Optional[int] = Field(default=None, ge=0, le=59)
    streak_celebrations_enabled: Optional[bool] = None
    inactivity_nudge_enabled: Optional[bool] = None
    inactivity_days_threshold: Optional[int] = Field(default=None, ge=1, le=7)
    water_reminders_enabled: Optional[bool] = None
    water_reminder_interval_hours: Optional[int] = Field(default=None, ge=1, le=6)


class SendTestRequest(BaseModel):
    title: str = "Test Fitsi"
    body: str = "Esta es una notificacion de prueba desde Fitsi IA"
    notification_type: str = "test"


class DispatchResponse(BaseModel):
    intents_count: int
    tickets_count: int
    tickets: list


class BatchDispatchResponse(BaseModel):
    users_evaluated: int
    notifications_sent: int
    errors: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/evaluate", response_model=EvaluateResponse)
async def evaluate_smart_notifications(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Evaluate all smart notification rules for the current user.
    Returns a list of notification intents that should be delivered.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = SmartNotificationService(session)

    notifications_enabled = await service.are_notifications_enabled(user_id)
    intents = await service.evaluate_notifications(user_id)

    return EvaluateResponse(
        notifications_enabled=notifications_enabled,
        intents=[
            NotificationIntentResponse(
                type=intent.type.value,
                title=intent.title,
                body=intent.body,
                scheduled_for=intent.scheduled_for.isoformat() if intent.scheduled_for else None,
                data=intent.data,
                priority=intent.priority,
            )
            for intent in intents
        ],
        count=len(intents),
    )


@router.get("/meal-times", response_model=PredictedMealTimesResponse)
async def get_predicted_meal_times(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return predicted meal times based on the user's historical logging
    patterns over the last 14 days.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = SmartNotificationService(session)

    predictions = await service.get_predicted_meal_times(user_id)

    return PredictedMealTimesResponse(
        predictions=[
            MealTimePrediction(
                meal_type=meal_type,
                predicted_time=predicted_time.strftime("%H:%M") if predicted_time else None,
            )
            for meal_type, predicted_time in predictions.items()
        ]
    )


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get the current user's notification preferences.
    Creates default preferences if none exist.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = SmartNotificationService(session)
    prefs = await service.get_preferences(user_id)

    return NotificationPreferencesResponse(
        notifications_enabled=prefs.notifications_enabled,
        meal_reminders_enabled=prefs.meal_reminders_enabled,
        breakfast_reminder_hour=prefs.breakfast_reminder_hour,
        breakfast_reminder_minute=prefs.breakfast_reminder_minute,
        lunch_reminder_hour=prefs.lunch_reminder_hour,
        lunch_reminder_minute=prefs.lunch_reminder_minute,
        dinner_reminder_hour=prefs.dinner_reminder_hour,
        dinner_reminder_minute=prefs.dinner_reminder_minute,
        snack_reminder_hour=prefs.snack_reminder_hour,
        snack_reminder_minute=prefs.snack_reminder_minute,
        use_predicted_times=prefs.use_predicted_times,
        reminder_lead_minutes=prefs.reminder_lead_minutes,
        evening_summary_enabled=prefs.evening_summary_enabled,
        evening_summary_hour=prefs.evening_summary_hour,
        evening_summary_minute=prefs.evening_summary_minute,
        streak_alerts_enabled=prefs.streak_alerts_enabled,
        streak_risk_hour=prefs.streak_risk_hour,
        streak_risk_minute=prefs.streak_risk_minute,
        streak_celebrations_enabled=prefs.streak_celebrations_enabled,
        inactivity_nudge_enabled=prefs.inactivity_nudge_enabled,
        inactivity_days_threshold=prefs.inactivity_days_threshold,
        water_reminders_enabled=prefs.water_reminders_enabled,
        water_reminder_interval_hours=prefs.water_reminder_interval_hours,
    )


@router.put("/preferences", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    body: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Update the current user's notification preferences.
    Only fields included in the request body will be changed.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = SmartNotificationService(session)

    # Only include non-None values
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    prefs = await service.update_preferences(user_id, updates)

    return NotificationPreferencesResponse(
        notifications_enabled=prefs.notifications_enabled,
        meal_reminders_enabled=prefs.meal_reminders_enabled,
        breakfast_reminder_hour=prefs.breakfast_reminder_hour,
        breakfast_reminder_minute=prefs.breakfast_reminder_minute,
        lunch_reminder_hour=prefs.lunch_reminder_hour,
        lunch_reminder_minute=prefs.lunch_reminder_minute,
        dinner_reminder_hour=prefs.dinner_reminder_hour,
        dinner_reminder_minute=prefs.dinner_reminder_minute,
        snack_reminder_hour=prefs.snack_reminder_hour,
        snack_reminder_minute=prefs.snack_reminder_minute,
        use_predicted_times=prefs.use_predicted_times,
        reminder_lead_minutes=prefs.reminder_lead_minutes,
        evening_summary_enabled=prefs.evening_summary_enabled,
        evening_summary_hour=prefs.evening_summary_hour,
        evening_summary_minute=prefs.evening_summary_minute,
        streak_alerts_enabled=prefs.streak_alerts_enabled,
        streak_risk_hour=prefs.streak_risk_hour,
        streak_risk_minute=prefs.streak_risk_minute,
        streak_celebrations_enabled=prefs.streak_celebrations_enabled,
        inactivity_nudge_enabled=prefs.inactivity_nudge_enabled,
        inactivity_days_threshold=prefs.inactivity_days_threshold,
        water_reminders_enabled=prefs.water_reminders_enabled,
        water_reminder_interval_hours=prefs.water_reminder_interval_hours,
    )


@router.post("/send-test")
async def send_test_notification(
    body: SendTestRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Send a test push notification to the current user.
    Useful for verifying push token registration works.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    push_service = NotificationService(session)

    try:
        tickets = await push_service.send_push(
            user_id=user_id,
            title=body.title,
            body=body.body,
            data={
                "type": body.notification_type,
                "screen": "HomeMain",
            },
        )
    except Exception as exc:
        logger.error("Failed to send test notification: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send push notification",
        )

    if not tickets:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active push tokens found. Register a token first.",
        )

    return {"detail": "Test notification sent", "tickets": tickets}


@router.post("/dispatch", response_model=DispatchResponse)
async def dispatch_notifications(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Evaluate all notification rules and immediately dispatch
    matching notifications via push. Returns the intents and
    Expo push tickets.
    """
    user_id: int = current_user.id  # type: ignore[assignment]
    service = SmartNotificationService(session)

    intents = await service.evaluate_notifications(user_id)
    tickets = await service.dispatch_notifications(user_id, intents)

    return DispatchResponse(
        intents_count=len(intents),
        tickets_count=len(tickets),
        tickets=tickets,
    )


@router.post("/dispatch-all", response_model=BatchDispatchResponse)
async def dispatch_all_notifications(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    Evaluate and dispatch notifications for ALL users with active push
    tokens. Admin-only endpoint, designed to be called periodically.
    """
    service = SmartNotificationService(session)
    stats = await service.evaluate_and_dispatch_all_users()

    return BatchDispatchResponse(
        users_evaluated=stats["users_evaluated"],
        notifications_sent=stats["notifications_sent"],
        errors=stats["errors"],
    )
