"""
AdminActionLog -- Immutable log of admin-initiated actions.

Records every admin action (premium grant/revoke, subscription changes,
food log moderation, user search, etc.) with the admin who performed it
and the reason provided.

This is separate from AuditLog (which tracks row-level mutations) and
focuses on *business-level* admin operations for accountability.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel


class AdminActionLog(SQLModel, table=True):
    __tablename__ = "admin_action_log"
    __table_args__ = (
        Index("ix_admin_action_log_admin_id", "admin_id"),
        Index("ix_admin_action_log_target_user", "target_user_id"),
        Index("ix_admin_action_log_action", "action"),
        Index("ix_admin_action_log_created", "created_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    admin_id: int = Field(nullable=False)
    action: str = Field(max_length=100, nullable=False)
    reason: Optional[str] = Field(default=None, max_length=1000)

    # Target (user being acted upon, if applicable)
    target_user_id: Optional[int] = Field(default=None)

    # Structured payload with before/after state or extra details
    details: Optional[dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.utcnow(),
    )
