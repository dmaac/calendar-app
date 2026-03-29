import logging
from fastapi import APIRouter, Depends, HTTPException, status
from enum import Enum
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..models.push_token import PushToken
from ..services.notification_service import NotificationService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class PushPlatform(str, Enum):
    ios = "ios"
    android = "android"


class RegisterTokenRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=500, description="Push notification token")
    platform: PushPlatform = Field(..., description="Platform: ios or android")


class SendTestRequest(BaseModel):
    title: str = Field("Test notification", min_length=1, max_length=200, description="Notification title")
    body: str = Field("This is a test push from Fitsi AI", min_length=1, max_length=2000, description="Notification body")


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_push_token(
    body: RegisterTokenRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # platform is validated by PushPlatform enum at the Pydantic layer

    # Check if this token already exists for this user
    statement = select(PushToken).where(
        PushToken.user_id == current_user.id,
        PushToken.token == body.token,
    )
    result = await session.execute(statement)
    existing = result.scalars().first()

    if existing:
        # Reactivate if it was deactivated
        if not existing.is_active:
            existing.is_active = True
            existing.platform = body.platform.value
            session.add(existing)
            await session.commit()
        return {"detail": "Push token registered"}

    push_token = PushToken(
        user_id=current_user.id,
        token=body.token,
        platform=body.platform.value,
    )
    session.add(push_token)
    await session.commit()
    return {"detail": "Push token registered"}


@router.delete("/unregister")
async def unregister_push_token(
    body: RegisterTokenRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    statement = select(PushToken).where(
        PushToken.user_id == current_user.id,
        PushToken.token == body.token,
    )
    result = await session.execute(statement)
    existing = result.scalars().first()

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Push token not found",
        )

    existing.is_active = False
    session.add(existing)
    await session.commit()
    return {"detail": "Push token deactivated"}


@router.post("/send-test")
async def send_test_notification(
    body: SendTestRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    service = NotificationService(session)
    try:
        tickets = await service.send_push(
            current_user.id,
            body.title,
            body.body,
            data={"type": "test"},
            notification_type="test",
            category="transactional",
            respect_quiet_hours=False,
        )
    except Exception as e:
        logger.error("Failed to send test notification: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send push notification",
        )

    if not tickets:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active push tokens found for this user",
        )

    return {"detail": "Test notification sent", "tickets": tickets}
