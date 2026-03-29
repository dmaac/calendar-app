"""
AdminErrorLog -- DB-backed error log for the admin panel.

Replaces the in-memory deque ring buffer with a persistent, queryable
table.  Entries are created by ``record_error()`` in the admin router
and by the global exception middleware.

The table is periodically pruned by a background task to keep only the
most recent N entries (configurable, default 10 000).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Index, text
from sqlmodel import Field, SQLModel


class AdminErrorLog(SQLModel, table=True):
    __tablename__ = "admin_error_log"
    __table_args__ = (
        Index("ix_admin_error_log_created", "created_at"),
        Index("ix_admin_error_log_type", "error_type"),
        Index("ix_admin_error_log_context", "context"),
        Index("ix_admin_error_log_severity", "severity"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    error_type: str = Field(max_length=200, nullable=False)
    message: str = Field(nullable=False)
    context: str = Field(default="", max_length=500)
    stack_trace: Optional[str] = Field(default=None)

    # severity: error, warning, critical
    severity: str = Field(default="error", max_length=20)

    # Optional link to the user/request that triggered the error
    user_id: Optional[int] = Field(default=None)
    endpoint: Optional[str] = Field(default=None, max_length=300)
    request_id: Optional[str] = Field(default=None, max_length=36)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
