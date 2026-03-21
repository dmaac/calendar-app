"""
Subscriptions router
────────────────────
POST /api/subscriptions          — create or update subscription (called after in-app purchase)
GET  /api/subscriptions/current  — get current subscription for authenticated user

SECURITY NOTE (2026-03-21):
  The POST endpoint now sets status='pending_verification' instead of 'active'.
  Subscriptions MUST be verified against Apple/Google receipt APIs before being
  promoted to 'active'.  A background worker or webhook handler should call
  verify_and_activate_subscription() after validating the store_tx_id.
  Until that verification, the user is NOT marked as premium.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.subscription import Subscription
from ..models.user import User
from ..routers.auth import get_current_user
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


class SubscriptionCreate(BaseModel):
    plan: str               # monthly | annual | lifetime
    store: Optional[str] = None   # apple | google | stripe
    store_tx_id: Optional[str] = None
    price_paid: Optional[float] = None
    discount_pct: Optional[int] = None
    trial_days: Optional[int] = None


class SubscriptionRead(BaseModel):
    id: int
    user_id: int
    plan: str
    status: str
    price_paid: Optional[float]
    discount_pct: Optional[int]
    store: Optional[str]
    trial_ends_at: Optional[datetime]
    current_period_ends_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=SubscriptionRead, status_code=status.HTTP_201_CREATED)
async def create_or_update_subscription(
    body: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Called after a successful in-app purchase (RevenueCat webhook or direct SDK call).
    Creates a new subscription in 'pending_verification' state.

    SECURITY: The subscription is NOT activated until the store receipt (store_tx_id)
    is verified against Apple App Store Server API or Google Play Developer API.
    A separate background job / webhook must call the verification logic and
    promote the status to 'active' + set user.is_premium = True.

    This prevents paywall bypass via forged store_tx_id values.
    """
    valid_plans = {"monthly", "annual", "lifetime"}
    if body.plan not in valid_plans:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"plan must be one of: {', '.join(valid_plans)}",
        )

    valid_stores = {"apple", "google", "stripe"}
    if not body.store or body.store not in valid_stores:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"store is required and must be one of: {', '.join(valid_stores)}",
        )

    if not body.store_tx_id or not body.store_tx_id.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="store_tx_id is required for purchase verification",
        )

    # Check for duplicate transaction IDs (replay attack prevention)
    existing_tx = await session.exec(
        select(Subscription).where(
            Subscription.store_tx_id == body.store_tx_id.strip(),
        )
    )
    if existing_tx.first():
        logger.warning(
            "Duplicate store_tx_id attempt: user_id=%s store_tx_id=%s",
            current_user.id, body.store_tx_id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This transaction has already been processed",
        )

    # Calculate period end (will only take effect after verification)
    now = datetime.now(timezone.utc)
    trial_ends_at = None
    current_period_ends_at = None

    if body.trial_days:
        from datetime import timedelta
        trial_ends_at = now + timedelta(days=body.trial_days)

    if body.plan == "monthly":
        from datetime import timedelta
        current_period_ends_at = now + timedelta(days=30)
    elif body.plan == "annual":
        from datetime import timedelta
        current_period_ends_at = now + timedelta(days=365)
    # lifetime has no end date

    # SECURITY: Status is 'pending_verification', NOT 'active'.
    # The user is NOT marked as premium until receipt validation completes.
    sub = Subscription(
        user_id=current_user.id,
        plan=body.plan,
        status="pending_verification",
        price_paid=body.price_paid,
        discount_pct=body.discount_pct,
        store=body.store,
        store_tx_id=body.store_tx_id.strip(),
        trial_ends_at=trial_ends_at,
        current_period_ends_at=current_period_ends_at,
    )
    session.add(sub)

    # NOTE: We intentionally do NOT set current_user.is_premium = True here.
    # That must only happen after store receipt verification succeeds.
    # Previous active subscriptions are NOT expired until the new one is verified.

    logger.info(
        "Subscription created as pending_verification: user_id=%s plan=%s store=%s tx_id=%s",
        current_user.id, body.plan, body.store, body.store_tx_id,
    )

    await session.commit()
    await session.refresh(sub)
    return sub


@router.get("/current", response_model=Optional[SubscriptionRead])
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Returns the user's most recent active or trial subscription, or null."""
    result = await session.exec(
        select(Subscription)
        .where(
            Subscription.user_id == current_user.id,
            Subscription.status.in_(["active", "trial"]),
        )
        .order_by(Subscription.created_at.desc())
    )
    return result.first()


@router.delete("/current", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Cancel the active subscription (marks as cancelled, not deleted)."""
    result = await session.exec(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.status.in_(["active", "trial"]),
        )
    )
    sub = result.first()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active subscription")

    sub.status = "cancelled"
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)

    current_user.is_premium = False
    current_user.updated_at = datetime.now(timezone.utc)
    session.add(current_user)

    await session.commit()


# ─── Receipt Verification Helper (to be called by background worker/webhook) ──

async def verify_and_activate_subscription(
    subscription_id: int,
    session: AsyncSession,
) -> bool:
    """
    Called AFTER verifying the store receipt against Apple/Google APIs.
    Promotes a pending_verification subscription to active and sets is_premium.

    This function should be called by:
      - A Celery task triggered after POST /api/subscriptions
      - An Apple/Google webhook handler
      - A manual admin verification endpoint

    Returns True if activation succeeded, False otherwise.
    """
    result = await session.exec(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.status == "pending_verification",
        )
    )
    sub = result.first()
    if not sub:
        logger.warning("verify_and_activate: subscription %d not found or not pending", subscription_id)
        return False

    # Expire any previous active subscriptions for this user
    active_result = await session.exec(
        select(Subscription).where(
            Subscription.user_id == sub.user_id,
            Subscription.status == "active",
        )
    )
    for old_sub in active_result.all():
        old_sub.status = "expired"
        old_sub.updated_at = datetime.now(timezone.utc)
        session.add(old_sub)

    # Activate the verified subscription
    sub.status = "active"
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)

    # NOW mark user as premium
    from ..models.user import User
    user = await session.get(User, sub.user_id)
    if user:
        user.is_premium = True
        user.updated_at = datetime.now(timezone.utc)
        session.add(user)

    await session.commit()
    logger.info("Subscription %d activated for user %d", subscription_id, sub.user_id)
    return True
