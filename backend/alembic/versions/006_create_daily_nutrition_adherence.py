"""Create daily_nutrition_adherence table for the Nutrition Risk Engine.

Revision ID: 006_adherence
Revises: 005_add_missing_indexes
Create Date: 2026-03-22

Table: daily_nutrition_adherence
- Stores daily adherence scores and risk metrics per user
- Unique constraint on (user_id, date)
- Indexes on user_id and (user_id, date)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_adherence"
down_revision: Union[str, None] = "005_add_missing_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "daily_nutrition_adherence",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        # Calorie targets vs actual
        sa.Column("calories_target", sa.Integer(), server_default="0", nullable=False),
        sa.Column("calories_logged", sa.Integer(), server_default="0", nullable=False),
        sa.Column("calories_ratio", sa.Float(), server_default="0.0", nullable=False),
        # Meals
        sa.Column("meals_logged", sa.Integer(), server_default="0", nullable=False),
        # Macro targets vs actual
        sa.Column("protein_target", sa.Integer(), server_default="0", nullable=False),
        sa.Column("protein_logged", sa.Integer(), server_default="0", nullable=False),
        sa.Column("carbs_target", sa.Integer(), server_default="0", nullable=False),
        sa.Column("carbs_logged", sa.Integer(), server_default="0", nullable=False),
        sa.Column("fats_target", sa.Integer(), server_default="0", nullable=False),
        sa.Column("fats_logged", sa.Integer(), server_default="0", nullable=False),
        # Composite scores
        sa.Column("diet_quality_score", sa.Integer(), server_default="0", nullable=False),
        sa.Column("adherence_status", sa.String(), server_default="critical", nullable=False),
        sa.Column("nutrition_risk_score", sa.Integer(), server_default="0", nullable=False),
        # Flags
        sa.Column("no_log_flag", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "date", name="uq_adherence_user_date"),
    )
    op.create_index("ix_adherence_user_id", "daily_nutrition_adherence", ["user_id"])
    op.create_index("ix_adherence_user_date", "daily_nutrition_adherence", ["user_id", "date"])


def downgrade() -> None:
    op.drop_index("ix_adherence_user_date", table_name="daily_nutrition_adherence")
    op.drop_index("ix_adherence_user_id", table_name="daily_nutrition_adherence")
    op.drop_table("daily_nutrition_adherence")
