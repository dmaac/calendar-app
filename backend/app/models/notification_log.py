"""
NotificationLog -- tracks every notification sent, for analytics and idempotency.

Each row represents a single notification dispatch attempt. The combination of
(user_id, notification_type, idempotency_key) is unique, preventing duplicate
sends within a given window.

Analytics fields (opened_at, dismissed_at) are updated via client callbacks.
"""

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Index, String, UniqueConstraint
from typing import Optional
from datetime import datetime, timezone


class NotificationLog(SQLModel, table=True):
    __tablename__ = "notification_log"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "idempotency_key",
            name="uq_notification_log_idempotency",
        ),
        Index(
            "ix_notification_log_user_type",
            "user_id", "notification_type",
        ),
        Index(
            "ix_notification_log_sent_at",
            "sent_at",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    # -- Classification -------------------------------------------------------
    notification_type: str = Field(index=True)  # matches NotificationType enum values
    category: str = Field(default="transactional")  # transactional, engagement, achievement, summary

    # -- Content (stored for audit) -------------------------------------------
    title: str = Field()
    body: str = Field()
    data_json: Optional[str] = Field(default=None)  # JSON-serialized payload

    # -- Delivery details -----------------------------------------------------
    channel: str = Field(default="push")  # push, email, sms (future-proof)
    expo_ticket_id: Optional[str] = Field(default=None)
    delivery_status: str = Field(default="pending")  # pending, sent, delivered, failed, bounced
    failure_reason: Optional[str] = Field(default=None)
    retry_count: int = Field(default=0)

    # -- Idempotency ----------------------------------------------------------
    # Format: "{notification_type}:{user_id}:{date or context}"
    # e.g. "meal_reminder:42:2026-03-23:breakfast"
    idempotency_key: str = Field(sa_column=Column(String, unique=True, index=True))

    # -- Analytics timestamps -------------------------------------------------
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    delivered_at: Optional[datetime] = Field(default=None)
    opened_at: Optional[datetime] = Field(default=None)
    dismissed_at: Optional[datetime] = Field(default=None)

    def __repr__(self) -> str:
        return (
            f"<NotificationLog id={self.id} user={self.user_id} "
            f"type={self.notification_type} status={self.delivery_status}>"
        )
