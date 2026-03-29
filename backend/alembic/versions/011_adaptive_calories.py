"""Create weight_log and calorie_adjustment tables for adaptive calorie system.

Revision ID: 011_adaptive_cal
Revises: 010_notif_schedule
Create Date: 2026-03-22

Tables: weight_log, calorie_adjustment
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_adaptive_cal"
down_revision: Union[str, None] = "010_notif_schedule"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── weight_log ──────────────────────────────────────────────────────────
    op.create_table(
        "weight_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),

        sa.UniqueConstraint("user_id", "date", name="uq_weight_log_user_date"),
    )

    op.create_index(
        "ix_weight_log_user_id",
        "weight_log",
        ["user_id"],
    )

    op.create_index(
        "ix_weight_log_user_date",
        "weight_log",
        ["user_id", "date"],
    )

    # ── calorie_adjustment ──────────────────────────────────────────────────
    op.create_table(
        "calorie_adjustment",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("week_end", sa.Date(), nullable=False),

        # Weight analysis
        sa.Column("predicted_weight", sa.Float(), nullable=False),
        sa.Column("actual_weight", sa.Float(), nullable=True),
        sa.Column("weight_delta", sa.Float(), nullable=True),

        # Calorie targets
        sa.Column("previous_target", sa.Integer(), nullable=False),
        sa.Column("new_target", sa.Integer(), nullable=False),
        sa.Column("adjustment_kcal", sa.Integer(), nullable=False, server_default="0"),

        # Classification
        sa.Column("adjustment_reason", sa.String(), nullable=False, server_default="on_track"),
        sa.Column("trend", sa.String(), nullable=False, server_default="stable"),

        # User action
        sa.Column("applied", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("dismissed", sa.Boolean(), nullable=False, server_default="false"),

        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),

        sa.UniqueConstraint("user_id", "week_start", name="uq_calorie_adj_user_week"),
    )

    op.create_index(
        "ix_calorie_adj_user_id",
        "calorie_adjustment",
        ["user_id"],
    )

    op.create_index(
        "ix_calorie_adj_user_week",
        "calorie_adjustment",
        ["user_id", "week_start"],
    )


def downgrade() -> None:
    op.drop_index("ix_calorie_adj_user_week", table_name="calorie_adjustment")
    op.drop_index("ix_calorie_adj_user_id", table_name="calorie_adjustment")
    op.drop_table("calorie_adjustment")

    op.drop_index("ix_weight_log_user_date", table_name="weight_log")
    op.drop_index("ix_weight_log_user_id", table_name="weight_log")
    op.drop_table("weight_log")
