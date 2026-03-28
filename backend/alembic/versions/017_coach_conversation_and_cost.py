"""017: coach_conversation and coach_cost_log tables

Revision ID: 017_coach_conv_cost
Revises: 016_scan_cache_extended_fields
Create Date: 2026-03-23

Adds:
- coach_conversation: stores last N messages per user for AI coach context continuity.
- coach_cost_log: tracks token usage and estimated cost per AI coach interaction.
"""

from alembic import op
import sqlalchemy as sa

revision = "017_coach_conv_cost"
down_revision = "016_scan_cache_extended_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- coach_conversation ---
    op.create_table(
        "coach_conversation",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_coach_conversation_user_id",
        "coach_conversation",
        ["user_id"],
    )
    op.create_index(
        "ix_coach_conversation_user_recent",
        "coach_conversation",
        ["user_id", "created_at"],
    )

    # --- coach_cost_log ---
    op.create_table(
        "coach_cost_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default="openai"),
        sa.Column("model", sa.String(), nullable=False, server_default="gpt-4o-mini"),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("error_type", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_coach_cost_log_user_id",
        "coach_cost_log",
        ["user_id"],
    )
    op.create_index(
        "ix_coach_cost_log_user_date",
        "coach_cost_log",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_coach_cost_log_created_at",
        "coach_cost_log",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_table("coach_cost_log")
    op.drop_table("coach_conversation")
