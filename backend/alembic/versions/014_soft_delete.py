"""Add soft-delete columns to critical tables.

Revision ID: 014_soft_delete
Revises: 012_fix_fav_times
Create Date: 2026-03-22

After losing 34 food log records to hard-delete with no recovery path, this
migration adds soft-delete support (deleted_at + deleted_by) to all tables
that contain user-generated nutritional data.  Existing queries remain
unaffected because a partial index filters on `deleted_at IS NULL`, and all
production code paths will be updated to set `deleted_at` instead of calling
`session.delete()`.

Tables modified:
  - ai_food_log
  - dailynutritionsummary
  - onboarding_profile
  - userfoodfavorite
  - weight_log
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014_soft_delete"
down_revision: Union[str, None] = "013_data_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that receive soft-delete columns.
# Format: (table_name, whether to add deleted_by column)
_TABLES = [
    ("ai_food_log", True),
    ("dailynutritionsummary", True),
    ("onboarding_profile", True),
    ("userfoodfavorite", True),
    ("weight_log", True),
]


def upgrade() -> None:
    # -- 1. Add soft-delete columns to each table --
    for table_name, include_deleted_by in _TABLES:
        op.add_column(
            table_name,
            sa.Column(
                "deleted_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=None,
            ),
        )
        if include_deleted_by:
            op.add_column(
                table_name,
                sa.Column(
                    "deleted_by",
                    sa.Integer(),
                    nullable=True,
                    server_default=None,
                ),
            )

    # -- 2. Partial index for efficient "active only" queries on ai_food_log --
    # This replaces the hot path for dashboard + history lookups with a smaller
    # index that automatically excludes soft-deleted rows.
    op.create_index(
        "idx_food_log_active",
        "ai_food_log",
        ["user_id", "logged_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # -- 3. Partial indexes for other high-traffic tables --
    op.create_index(
        "idx_daily_summary_active",
        "dailynutritionsummary",
        ["user_id", "date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_index(
        "idx_favorites_active",
        "userfoodfavorite",
        ["user_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_index(
        "idx_weight_log_active",
        "weight_log",
        ["user_id", "date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    # Drop partial indexes first
    op.drop_index("idx_weight_log_active", table_name="weight_log")
    op.drop_index("idx_favorites_active", table_name="userfoodfavorite")
    op.drop_index("idx_daily_summary_active", table_name="dailynutritionsummary")
    op.drop_index("idx_food_log_active", table_name="ai_food_log")

    # Drop columns
    for table_name, include_deleted_by in reversed(_TABLES):
        if include_deleted_by:
            op.drop_column(table_name, "deleted_by")
        op.drop_column(table_name, "deleted_at")
