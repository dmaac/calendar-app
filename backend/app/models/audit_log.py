"""
AuditLog — Immutable audit trail model.

Every INSERT, UPDATE, and DELETE on critical tables is captured here,
both by the PostgreSQL trigger (audit_trigger_fn) and by the application-
level audit service.

This table is append-only in production. Never expose UPDATE or DELETE
endpoints for audit_log records.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("idx_audit_table_record", "table_name", "record_id"),
        Index("idx_audit_user", "user_id"),
        Index("idx_audit_action", "action"),
        Index("idx_audit_created", "created_at"),
        Index("idx_audit_action_created", "action", "created_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    table_name: str = Field(max_length=100, nullable=False)
    record_id: int = Field(nullable=False)
    action: str = Field(
        max_length=10,
        nullable=False,
        description="INSERT, UPDATE, or DELETE",
    )

    old_data: Optional[dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    new_data: Optional[dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )

    user_id: Optional[int] = Field(default=None, index=True)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    user_agent: Optional[str] = Field(default=None)
    endpoint: Optional[str] = Field(default=None, max_length=200)
    request_id: Optional[str] = Field(default=None, max_length=36)

    created_at: datetime = Field(
        sa_column_kwargs={"server_default": text("NOW()")},
        default_factory=lambda: datetime.utcnow(),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} table={self.table_name!r} "
            f"record={self.record_id} action={self.action!r}>"
        )


# ─── Pydantic read schemas ─────────────────────────────────────────────────

class AuditLogRead(SQLModel):
    """Response schema for a single audit log entry."""
    id: int
    table_name: str
    record_id: int
    action: str
    old_data: Optional[dict[str, Any]] = None
    new_data: Optional[dict[str, Any]] = None
    user_id: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    endpoint: Optional[str] = None
    request_id: Optional[str] = None
    created_at: datetime


class AuditLogSummary(SQLModel):
    """Lightweight summary used in list views."""
    id: int
    table_name: str
    record_id: int
    action: str
    user_id: Optional[int] = None
    endpoint: Optional[str] = None
    created_at: datetime
