"""Reusable model mixins for cross-cutting concerns.

SoftDeleteMixin
    Adds `deleted_at` / `deleted_by` columns plus a convenience property
    `is_deleted`.  Models that inherit this mixin participate in the
    soft-delete lifecycle managed by `DataProtectionService`.

Usage:
    class AIFoodLog(SoftDeleteMixin, SQLModel, table=True):
        ...

    # Check status
    if record.is_deleted:
        ...

    # Mark as deleted (prefer DataProtectionService.soft_delete)
    record.mark_deleted(acting_user_id=42)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field
from sqlalchemy import Column, DateTime, Integer as SAInteger


class SoftDeleteMixin:
    """Mixin that adds soft-delete columns to a SQLModel table.

    Columns
    -------
    deleted_at : datetime | None
        UTC timestamp when the record was soft-deleted.  ``None`` means active.
    deleted_by : int | None
        ID of the user who performed the delete (audit trail).
    """

    deleted_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})
    deleted_by: Optional[int] = Field(default=None, sa_column_kwargs={"nullable": True})

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    @property
    def is_deleted(self) -> bool:
        """Return ``True`` if this record has been soft-deleted."""
        return self.deleted_at is not None

    def mark_deleted(self, acting_user_id: int | None = None) -> None:
        """Set the soft-delete timestamp and optional actor.

        This does NOT commit -- the caller must flush/commit the session.
        """
        self.deleted_at = datetime.now(timezone.utc)
        if acting_user_id is not None:
            self.deleted_by = acting_user_id

    def restore(self) -> None:
        """Clear the soft-delete marker so the record is active again.

        This does NOT commit -- the caller must flush/commit the session.
        """
        self.deleted_at = None
        self.deleted_by = None
