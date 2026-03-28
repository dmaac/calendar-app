"""Create backup_registry table for user data point-in-time recovery.

Revision ID: 015_backup_reg
Revises: 012_fix_fav_times
Create Date: 2026-03-22

This table stores metadata about every user data backup snapshot. The actual
snapshot payload is stored in Supabase Storage (bucket: user-backups) as a
compressed JSON file. The registry enables:

  - Listing available backups for a user
  - Restoring from a specific point in time
  - Automatic pre-deletion backups for safety
  - Expiration-based cleanup of old backups
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_backup_reg"
down_revision: Union[str, None] = "014_soft_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "backup_registry",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "backup_type",
            sa.String(20),
            nullable=False,
            comment="manual | auto | pre_delete | scheduled",
        ),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column(
            "tables_included",
            sa.Text(),
            nullable=False,
            comment="JSON array of table names included in backup",
        ),
        sa.Column(
            "record_counts",
            sa.Text(),
            nullable=False,
            comment="JSON dict {table: count} for verification",
        ),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("trigger_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="NULL = keep forever",
        ),
    )

    # Index for listing backups by user, newest first
    op.create_index(
        "ix_backup_registry_user_created",
        "backup_registry",
        ["user_id", "created_at"],
    )

    # Index for cleanup job to find expired backups
    op.create_index(
        "ix_backup_registry_expires_at",
        "backup_registry",
        ["expires_at"],
        postgresql_where=sa.text("expires_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_backup_registry_expires_at", table_name="backup_registry")
    op.drop_index("ix_backup_registry_user_created", table_name="backup_registry")
    op.drop_table("backup_registry")
