"""Performance: composite + functional indexes on ai_food_log.

Revision ID: 019_perf_composite_idx
Revises: 018_db_optimization
Create Date: 2026-03-23

Adds two new indexes for the most expensive query patterns:

1. ix_ai_food_log_user_active_logged (user_id, deleted_at, logged_at)
   - Covers the daily summary aggregate query which filters by
     user_id + deleted_at IS NULL and ranges on logged_at.

2. ix_ai_food_log_user_date_logged (user_id, DATE(logged_at))
   - Functional index that covers streak calculation and all
     queries that group/filter by DATE(logged_at).
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "019_perf_composite_idx"
down_revision = "018_db_optimization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Composite index: active records for a user sorted by date
    op.create_index(
        "ix_ai_food_log_user_active_logged",
        "ai_food_log",
        ["user_id", "deleted_at", "logged_at"],
        if_not_exists=True,
    )

    # Functional index: DATE(logged_at) for streak and daily grouping queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_ai_food_log_user_date_logged "
        "ON ai_food_log (user_id, (DATE(logged_at)))"
    )


def downgrade() -> None:
    op.drop_index("ix_ai_food_log_user_date_logged", table_name="ai_food_log")
    op.drop_index("ix_ai_food_log_user_active_logged", table_name="ai_food_log")
