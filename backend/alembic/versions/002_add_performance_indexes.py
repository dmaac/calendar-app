"""Add performance indexes for meallog, ai_food_log, and subscription tables.

Revision ID: 002_add_performance_indexes
Revises: 001_initial_schema
Create Date: 2026-03-19

Indexes added
-------------
1. ix_meallog_user_date        — meallog(user_id, date)
   Meals are always queried by user + date (e.g. "show today's meals for user X").
   Without this index every such query triggers a full table scan on meallog.

2. ix_ai_food_log_user_logged  — ai_food_log(user_id, logged_at)
   NOTE: Migration 001_initial_schema already created ix_ai_food_log_user_logged_at
   on the identical column pair (user_id, logged_at).  A second index on the same
   columns would be redundant and waste storage/write overhead, so this index is
   intentionally omitted from upgrade().  The existing ix_ai_food_log_user_logged_at
   already satisfies all dashboard queries that filter by user + date-range.

3. ix_subscription_user_status — subscription(user_id, status)
   Subscription lookups almost always filter on both user_id and status
   (e.g. "is this user's subscription active?").  The existing single-column
   ix_subscription_user_id cannot satisfy the compound predicate efficiently.

PostgreSQL CONCURRENTLY note
----------------------------
Alembic's op.create_index does not support CONCURRENTLY natively because
CONCURRENTLY cannot run inside a transaction and Alembic wraps every migration
in a transaction by default.  The standard approach is to either:
  a) Run the migration with --no-transaction (requires Alembic ≥ 1.7 and a
     PostgreSQL-only migration env).
  b) Accept a brief table lock by using the regular CREATE INDEX (shown below),
     which is safe on tables that are not yet large in production.

If this migration needs to be applied to a large production database with zero
downtime, use option (a) or apply the index manually with:

    CREATE INDEX CONCURRENTLY ix_meallog_user_date
        ON meallog (user_id, date);

    CREATE INDEX CONCURRENTLY ix_subscription_user_status
        ON subscription (user_id, status);

then mark the migration as applied with: alembic stamp 002_add_performance_indexes
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_add_performance_indexes"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. meallog(user_id, date) ──────────────────────────────────────────────
    # Speeds up the common "fetch all meals for user X on date Y" query.
    # Table name is "meallog" (SQLModel default, no explicit __tablename__).
    op.create_index(
        "ix_meallog_user_date",
        "meallog",
        ["user_id", "date"],
        unique=False,
    )

    # ── 2. ai_food_log(user_id, logged_at) — SKIPPED ──────────────────────────
    # ix_ai_food_log_user_logged_at covering (user_id, logged_at) was already
    # created in migration 001_initial_schema.  Creating ix_ai_food_log_user_logged
    # on the same columns would be a duplicate index with no benefit.

    # ── 3. subscription(user_id, status) ──────────────────────────────────────
    # Speeds up subscription lookups that filter by both user and status.
    # Migration 001 only created ix_subscription_user_id (single-column).
    op.create_index(
        "ix_subscription_user_status",
        "subscription",
        ["user_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_user_status", table_name="subscription")
    op.drop_index("ix_meallog_user_date", table_name="meallog")
