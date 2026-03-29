from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint, Text
from typing import Optional, TYPE_CHECKING
from datetime import datetime

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

    # Plan: monthly / yearly / lifetime
    plan: str = Field()
    # Status: pending_verification / active / trial / canceled / expired /
    #         billing_retry / grace_period / refunded
    status: str = Field(index=True)

    price_paid: Optional[float] = Field(default=None)
    currency: str = Field(default="USD")
    discount_pct: Optional[int] = Field(default=None)

    trial_ends_at: Optional[datetime] = Field(default=None)
    current_period_ends_at: Optional[datetime] = Field(default=None)

    # Store: apple / google / stripe
    store: Optional[str] = Field(default=None)
    store_tx_id: Optional[str] = Field(default=None, index=True)

    # RevenueCat product identifier (e.g. "fitsi_premium_monthly", "fitsi_premium_yearly")
    rc_product_id: Optional[str] = Field(default=None, max_length=200)

    # Cancellation / billing metadata
    auto_renew_enabled: bool = Field(default=True)
    billing_issues_detected_at: Optional[datetime] = Field(default=None)
    grace_period_ends_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="subscriptions")

    def __repr__(self) -> str:
        return (
            f"<Subscription id={self.id} user={self.user_id} "
            f"plan={self.plan!r} status={self.status!r}>"
        )


class WebhookEventLog(SQLModel, table=True):
    """Audit log for every inbound webhook event (RevenueCat, Apple, Google).

    Persisted *before* processing so that even if the handler crashes, the raw
    event is available for replay / debugging.
    """

    __tablename__ = "webhook_event_log"
    __table_args__ = (
        Index("ix_webhook_event_log_source_type", "source", "event_type"),
        Index("ix_webhook_event_log_created", "created_at"),
        Index("ix_webhook_event_log_user", "app_user_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    source: str = Field(max_length=32)      # "revenuecat" | "apple" | "google"
    event_type: str = Field(max_length=64)   # e.g. "INITIAL_PURCHASE", "DID_RENEW"
    app_user_id: Optional[str] = Field(default=None, max_length=200)
    raw_payload: Optional[str] = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    processing_result: Optional[str] = Field(default=None, max_length=200)
    error_message: Optional[str] = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
