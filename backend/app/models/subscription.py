from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint
from typing import Optional, TYPE_CHECKING
from datetime import datetime, timezone

if TYPE_CHECKING:
    from .user import User


class Subscription(SQLModel, table=True):
    __tablename__ = "subscription"
    __table_args__ = (
        # Common lookup: active subscriptions for a user
        Index("ix_subscription_user_status", "user_id", "status"),
        # Expiry checks: find subscriptions expiring before a given timestamp
        Index("ix_subscription_period_ends", "current_period_ends_at"),
        # Trial expiry checks
        Index("ix_subscription_trial_ends", "trial_ends_at"),
        # SEC: Prevent duplicate receipt processing (replay attacks)
        UniqueConstraint("store_tx_id", name="uq_subscription_store_tx_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )

    # Plan: free / monthly / yearly / lifetime
    plan: str = Field()
    # Status: pending_verification / active / trial / canceled / expired
    status: str = Field(index=True)

    price_paid: Optional[float] = Field(default=None)
    currency: str = Field(default="USD")
    discount_pct: Optional[int] = Field(default=None)

    trial_ends_at: Optional[datetime] = Field(default=None)
    current_period_ends_at: Optional[datetime] = Field(default=None)

    # Store: apple / google / stripe
    store: Optional[str] = Field(default=None)
    store_tx_id: Optional[str] = Field(default=None, index=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    user: "User" = Relationship(back_populates="subscriptions")

    def __repr__(self) -> str:
        return (
            f"<Subscription id={self.id} user={self.user_id} "
            f"plan={self.plan!r} status={self.status!r}>"
        )
