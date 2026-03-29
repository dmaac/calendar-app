"""Create data_integrity_snapshots table for the data monitor service.

Revision ID: 013_data_integrity
Revises: 012_fix_fav_times
Create Date: 2026-03-22

Stores periodic snapshots of record counts per user per table.
Used by the integrity checker to detect silent data loss by comparing
consecutive snapshots.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_data_integrity"
down_revision: Union[str, None] = "013_audit_trail"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "data_integrity_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_name", sa.String(128), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "snapshot_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Index for fast lookups: latest snapshots per user + table
    op.create_index(
        "ix_data_integrity_snap_user_table_ts",
        "data_integrity_snapshots",
        ["user_id", "table_name", sa.text("snapshot_at DESC")],
    )

    # Index for pruning old snapshots
    op.create_index(
        "ix_data_integrity_snap_ts",
        "data_integrity_snapshots",
        ["snapshot_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_data_integrity_snap_ts", table_name="data_integrity_snapshots")
    op.drop_index("ix_data_integrity_snap_user_table_ts", table_name="data_integrity_snapshots")
    op.drop_table("data_integrity_snapshots")
