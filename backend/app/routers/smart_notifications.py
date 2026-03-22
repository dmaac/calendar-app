"""
Smart Notifications router.

GET  /api/smart-notifications/evaluate   — Run all notification rules and return intents
GET  /api/smart-notifications/meal-times — Predicted meal times based on log history
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..services.smart_notification_service import SmartNotificationService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/smart-notifications", tags=["smart-notifications"])


# ---------------------------------------------------------------------------
# Response schemas
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
    The mobile client or a background worker can use this to schedule
    local or push notifications.
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
