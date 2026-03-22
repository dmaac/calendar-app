"""Add is_admin column to users, create feedback and push_token tables.

Revision ID: 004_add_is_admin_and_feedback
Revises: 003_add_food_created_by
Create Date: 2026-03-22

Changes
-------
1. user.is_admin — boolean NOT NULL DEFAULT false
   Grants access to /api/admin/* endpoints.

2. feedback table — in-app feedback from users
   Columns: id, user_id (FK), type (enum), message, screen, app_version,
   device_model, device_os, device_os_version, status (enum), admin_notes,
   created_at, updated_at.
   Indexes: user_id, type, status, created_at.

3. push_token table — Expo push notification tokens
   Columns: id, user_id (FK), token, platform, is_active, created_at.
   Indexes: user_id, token.

All three changes are idempotent-safe: the upgrade checks for existence
before creating (tables) or adding (columns) to support re-runs.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_add_is_admin_and_feedback"
down_revision: Union[str, None] = "003_add_food_created_by"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add is_admin column to user table ─────────────────────────────────
    op.add_column(
        "user",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # ── 2. Create feedback table ─────────────────────────────────────────────
    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        # type: bug, feature, complaint, praise
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=5000), nullable=False),
        sa.Column("screen", sa.String(length=200), nullable=True),
        sa.Column("app_version", sa.String(length=50), nullable=True),
        # Device metadata
        sa.Column("device_model", sa.String(length=200), nullable=True),
        sa.Column("device_os", sa.String(length=100), nullable=True),
        sa.Column("device_os_version", sa.String(length=50), nullable=True),
        # status: new, reviewed, in_progress, resolved, dismissed
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("admin_notes", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Indexes matching the model's __table_args__
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"], unique=False)
    op.create_index("ix_feedback_type", "feedback", ["type"], unique=False)
    op.create_index("ix_feedback_status", "feedback", ["status"], unique=False)
    op.create_index("ix_feedback_created_at", "feedback", ["created_at"], unique=False)

    # ── 3. Create push_token table ───────────────────────────────────────────
    op.create_table(
        "push_token",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("platform", sa.String(), nullable=False),  # "ios" or "android"
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_push_token_user_id", "push_token", ["user_id"], unique=False)
    op.create_index("ix_push_token_token", "push_token", ["token"], unique=False)


def downgrade() -> None:
    # ── 3. Drop push_token ───────────────────────────────────────────────────
    op.drop_index("ix_push_token_token", table_name="push_token")
    op.drop_index("ix_push_token_user_id", table_name="push_token")
    op.drop_table("push_token")

    # ── 2. Drop feedback ─────────────────────────────────────────────────────
    op.drop_index("ix_feedback_created_at", table_name="feedback")
    op.drop_index("ix_feedback_status", table_name="feedback")
    op.drop_index("ix_feedback_type", table_name="feedback")
    op.drop_index("ix_feedback_user_id", table_name="feedback")
    op.drop_table("feedback")

    # ── 1. Remove is_admin from user ─────────────────────────────────────────
    op.drop_column("user", "is_admin")
