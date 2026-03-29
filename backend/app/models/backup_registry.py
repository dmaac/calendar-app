"""
BackupRegistry model -- tracks all user data backup snapshots.

Each record represents a point-in-time snapshot of a user's data stored in
Supabase Storage (bucket: user-backups). Backups can be triggered manually
by an admin, automatically before destructive operations, or on a schedule.
"""
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional, List
from datetime import datetime, timezone


class BackupRegistry(SQLModel, table=True):
    __tablename__ = "backup_registry"
    __table_args__ = (
        Index("ix_backup_registry_user_created", "user_id", "created_at"),
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

    # 'manual', 'auto', 'pre_delete', 'scheduled'
    backup_type: str = Field(max_length=20)

    # Path in Supabase Storage (bucket: user-backups)
    storage_path: str = Field()

    # Which tables were included in this backup (PostgreSQL TEXT[])
    tables_included: str = Field()  # JSON-encoded list, e.g. '["user","ai_food_log"]'

    # {table_name: record_count} for verification after restore
    record_counts: str = Field()  # JSON-encoded dict, e.g. '{"user":1,"ai_food_log":42}'

    size_bytes: Optional[int] = Field(default=None)

    # Human-readable reason why backup was created
    trigger_reason: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    # NULL = keep forever
    expires_at: Optional[datetime] = Field(default=None)

    def __repr__(self) -> str:
        return (
            f"<BackupRegistry id={self.id} user={self.user_id} "
            f"type={self.backup_type!r} created={self.created_at}>"
        )


# ---------------------------------------------------------------------------
# Pydantic schemas for API request/response
# ---------------------------------------------------------------------------

class BackupRegistryRead(SQLModel):
    """Response schema for a single backup record."""
    id: int
    user_id: int
    backup_type: str
    storage_path: str
    tables_included: List[str]
    record_counts: dict
    size_bytes: Optional[int]
    trigger_reason: Optional[str]
    created_at: datetime
    expires_at: Optional[datetime]


class BackupCreateRequest(SQLModel):
    """Request body for POST /api/admin/backup/{user_id}."""
    backup_type: str = Field(default="manual")
    trigger_reason: Optional[str] = Field(default=None)
    expires_at: Optional[datetime] = Field(default=None)


class RestoreRequest(SQLModel):
    """Request body for POST /api/admin/backup/restore/{backup_id}."""
    tables: Optional[List[str]] = Field(
        default=None,
        description="Specific tables to restore. If None, restores all tables in the backup.",
    )


class RestorePreviewResponse(SQLModel):
    """Preview of what a restore operation would do."""
    backup_id: int
    user_id: int
    backup_type: str
    created_at: datetime
    tables_available: List[str]
    record_counts: dict
    size_bytes: Optional[int]
    warning: str = "Restoring will overwrite current data for the selected tables."
