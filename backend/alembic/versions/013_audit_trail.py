"""Create audit_log table with PostgreSQL trigger functions for critical tables.

Revision ID: 013_audit_trail
Revises: 012_fix_fav_times
Create Date: 2026-03-22

Immutable audit trail that captures every INSERT, UPDATE, and DELETE on
critical tables. A PostgreSQL trigger function writes to audit_log
automatically so that application-level bugs or direct SQL mutations
cannot bypass the trail.

Monitored tables:
  ai_food_log, dailynutritionsummary, onboarding_profile, subscription,
  user, weight_log, userfoodfavorite
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_audit_trail"
down_revision: Union[str, None] = "012_fix_fav_times"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that receive automatic audit triggers
AUDITED_TABLES = [
    "ai_food_log",
    "dailynutritionsummary",
    "onboarding_profile",
    "subscription",
    "user",
    "weight_log",
    "userfoodfavorite",
]


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Create the audit_log table
    # ------------------------------------------------------------------
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("record_id", sa.Integer(), nullable=False),
        sa.Column(
            "action",
            sa.String(10),
            nullable=False,
            comment="INSERT, UPDATE, or DELETE",
        ),
        sa.Column("old_data", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("new_data", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("endpoint", sa.String(200), nullable=True),
        sa.Column("request_id", sa.String(36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # ------------------------------------------------------------------
    # 2. Create indexes for common query patterns
    # ------------------------------------------------------------------
    op.create_index(
        "idx_audit_table_record",
        "audit_log",
        ["table_name", "record_id"],
    )
    op.create_index("idx_audit_user", "audit_log", ["user_id"])
    op.create_index("idx_audit_action", "audit_log", ["action"])
    op.create_index("idx_audit_created", "audit_log", ["created_at"])
    # Composite index for the most common admin query: "show me deletions
    # in the last N days" (action + created_at).
    op.create_index(
        "idx_audit_action_created",
        "audit_log",
        ["action", "created_at"],
    )

    # ------------------------------------------------------------------
    # 3. Create the generic trigger function
    # ------------------------------------------------------------------
    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION audit_trigger_fn()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        DECLARE
            rec_id INTEGER;
            old_json JSONB;
            new_json JSONB;
            audit_user_id INTEGER;
        BEGIN
            -- Determine record ID (prefer NEW for INSERT/UPDATE, OLD for DELETE)
            IF TG_OP = 'DELETE' THEN
                rec_id := OLD.id;
                old_json := to_jsonb(OLD);
                new_json := NULL;
            ELSIF TG_OP = 'INSERT' THEN
                rec_id := NEW.id;
                old_json := NULL;
                new_json := to_jsonb(NEW);
            ELSE  -- UPDATE
                rec_id := NEW.id;
                old_json := to_jsonb(OLD);
                new_json := to_jsonb(NEW);
            END IF;

            -- Try to extract user_id from the row if the column exists
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    audit_user_id := OLD.user_id;
                ELSE
                    audit_user_id := NEW.user_id;
                END IF;
            EXCEPTION WHEN undefined_column THEN
                -- Table does not have a user_id column (e.g. the user table itself)
                IF TG_TABLE_NAME = 'user' THEN
                    audit_user_id := rec_id;
                ELSE
                    audit_user_id := NULL;
                END IF;
            END;

            -- Application-level context (set by the middleware via SET LOCAL)
            INSERT INTO audit_log (
                table_name,
                record_id,
                action,
                old_data,
                new_data,
                user_id,
                ip_address,
                user_agent,
                endpoint,
                request_id
            ) VALUES (
                TG_TABLE_NAME,
                rec_id,
                TG_OP,
                old_json,
                new_json,
                audit_user_id,
                current_setting('audit.ip_address', TRUE),
                current_setting('audit.user_agent', TRUE),
                current_setting('audit.endpoint', TRUE),
                current_setting('audit.request_id', TRUE)
            );

            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END;
        $$;
    """))

    # ------------------------------------------------------------------
    # 4. Attach triggers to every audited table
    # ------------------------------------------------------------------
    for table in AUDITED_TABLES:
        op.execute(sa.text(f"""
            CREATE TRIGGER audit_{table}_trigger
            AFTER INSERT OR UPDATE OR DELETE ON "{table}"
            FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
        """))


def downgrade() -> None:
    # Drop triggers first (reverse order)
    for table in reversed(AUDITED_TABLES):
        op.execute(sa.text(
            f'DROP TRIGGER IF EXISTS audit_{table}_trigger ON "{table}";'
        ))

    # Drop trigger function
    op.execute(sa.text("DROP FUNCTION IF EXISTS audit_trigger_fn();"))

    # Drop indexes
    op.drop_index("idx_audit_action_created", table_name="audit_log")
    op.drop_index("idx_audit_created", table_name="audit_log")
    op.drop_index("idx_audit_action", table_name="audit_log")
    op.drop_index("idx_audit_user", table_name="audit_log")
    op.drop_index("idx_audit_table_record", table_name="audit_log")

    # Drop table
    op.drop_table("audit_log")
