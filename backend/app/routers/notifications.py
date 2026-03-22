import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..models.push_token import PushToken
from ..services.notification_service import NotificationService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class RegisterTokenRequest(BaseModel):
    token: str
    platform: str  # "ios" or "android"


class SendTestRequest(BaseModel):
    title: str = "Test notification"
    body: str = "This is a test push from Fitsi IA"


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_push_token(
    body: RegisterTokenRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.platform not in ("ios", "android"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Platform must be 'ios' or 'android'",
        )

    # Check if this token already exists for this user
    statement = select(PushToken).where(
        PushToken.user_id == current_user.id,
        PushToken.token == body.token,
    )
    result = await session.exec(statement)
    existing = result.first()

    if existing:
        # Reactivate if it was deactivated
        if not existing.is_active:
            existing.is_active = True
            existing.platform = body.platform
            session.add(existing)
            await session.commit()
        return {"detail": "Push token registered"}

    push_token = PushToken(
        user_id=current_user.id,
        token=body.token,
        platform=body.platform,
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
    result = await session.exec(statement)
    existing = result.first()

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
