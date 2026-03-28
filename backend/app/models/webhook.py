"""
Webhook & WebhookDelivery models
─────────────────────────────────
Persists webhook registrations and their delivery history.
"""

from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime, timezone
from enum import Enum

if TYPE_CHECKING:
    from .user import User


class WebhookEvent(str, Enum):
    """Supported webhook event types."""
    MEAL_LOGGED = "meal_logged"
    GOAL_REACHED = "goal_reached"
    STREAK_MILESTONE = "streak_milestone"
    WORKOUT_LOGGED = "workout_logged"
    SUBSCRIPTION_ACTIVATED = "subscription_activated"
    SUBSCRIPTION_CANCELLED = "subscription_cancelled"
    SUBSCRIPTION_RENEWED = "subscription_renewed"
    SUBSCRIPTION_EXPIRED = "subscription_expired"
    SUBSCRIPTION_REFUNDED = "subscription_refunded"


class DeliveryStatus(str, Enum):
    """Delivery attempt result."""
    SUCCESS = "success"
    FAILED = "failed"
    PENDING = "pending"


class Webhook(SQLModel, table=True):
    """A registered webhook endpoint for a user + event combination."""

    __tablename__ = "webhook"
    __table_args__ = (
        Index("ix_webhook_user_id", "user_id"),
        Index("ix_webhook_event", "event"),
        Index("ix_webhook_is_active", "is_active"),
        # Common lookup: active webhooks for a user + event type
        Index("ix_webhook_user_event_active", "user_id", "event", "is_active"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )

    url: str = Field(max_length=2048, description="HTTPS endpoint to receive POST payloads")
    event: WebhookEvent = Field(description="Event type that triggers this webhook")
    secret: str = Field(max_length=256, description="HMAC-SHA256 signing secret")

    is_active: bool = Field(default=True, description="Soft-disable without deleting")
    description: Optional[str] = Field(default=None, max_length=500)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    deliveries: List["WebhookDelivery"] = Relationship(back_populates="webhook")
    user: "User" = Relationship()

    def __repr__(self) -> str:
        return f"<Webhook id={self.id} user={self.user_id} event={self.event} active={self.is_active}>"


class WebhookDelivery(SQLModel, table=True):
    """Log of every delivery attempt for a webhook."""

    __tablename__ = "webhook_delivery"
    __table_args__ = (
        Index("ix_webhook_delivery_webhook_id", "webhook_id"),
        Index("ix_webhook_delivery_status", "status"),
        Index("ix_webhook_delivery_created_at", "created_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    webhook_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("webhook.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )

    event: WebhookEvent = Field(description="Event that triggered this delivery")
    payload: str = Field(description="JSON payload sent in the request body")

    status: DeliveryStatus = Field(default=DeliveryStatus.PENDING)
    http_status: Optional[int] = Field(default=None, description="HTTP status code from the target")
    response_body: Optional[str] = Field(default=None, max_length=5000, description="Truncated response body")
    error_message: Optional[str] = Field(default=None, max_length=2000)

    attempt: int = Field(default=1, description="Attempt number (1-based)")
    duration_ms: Optional[float] = Field(default=None, description="Round-trip time in milliseconds")

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    webhook: "Webhook" = Relationship(back_populates="deliveries")

    def __repr__(self) -> str:
        return (
            f"<WebhookDelivery id={self.id} webhook={self.webhook_id} "
            f"status={self.status} attempt={self.attempt}>"
        )
