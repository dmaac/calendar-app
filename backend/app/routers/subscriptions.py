"""
Subscriptions router
────────────────────
POST /api/subscriptions          — create or update subscription (called after in-app purchase)
GET  /api/subscriptions/current  — get current subscription for authenticated user
"""

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
    Creates a new subscription or replaces the active one.
    Also updates user.is_premium = True.
    """
    valid_plans = {"monthly", "annual", "lifetime"}
    if body.plan not in valid_plans:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"plan must be one of: {', '.join(valid_plans)}",
        )

    # Expire any previous active subscriptions
    result = await session.exec(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.status == "active",
        )
    )
    for old_sub in result.all():
        old_sub.status = "expired"
        old_sub.updated_at = datetime.now(timezone.utc)
        session.add(old_sub)

    # Calculate period end
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

    sub = Subscription(
        user_id=current_user.id,
        plan=body.plan,
        status="trial" if body.trial_days else "active",
        price_paid=body.price_paid,
        discount_pct=body.discount_pct,
        store=body.store,
        store_tx_id=body.store_tx_id,
        trial_ends_at=trial_ends_at,
        current_period_ends_at=current_period_ends_at,
    )
    session.add(sub)

    # Mark user as premium
    current_user.is_premium = True
    current_user.updated_at = datetime.now(timezone.utc)
    session.add(current_user)

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
