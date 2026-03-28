"""
DataIntegritySnapshot model — stores periodic record count snapshots
per user per table for data loss detection.

Used by:
  - data_monitor_service.py (writes snapshots)
  - integrity_checker.py (compares consecutive snapshots)
"""

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional
from datetime import datetime, timezone


class DataIntegritySnapshot(SQLModel, table=True):
    __tablename__ = "data_integrity_snapshots"
    __table_args__ = (
        Index(
            "ix_data_integrity_snap_user_table_ts",
            "user_id", "table_name", "snapshot_at",
        ),
        Index("ix_data_integrity_snap_ts", "snapshot_at"),
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
    table_name: str = Field(max_length=128)
    record_count: int = Field(default=0)
    snapshot_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return (
            f"<DataIntegritySnapshot id={self.id} user={self.user_id} "
            f"table={self.table_name!r} count={self.record_count}>"
        )
