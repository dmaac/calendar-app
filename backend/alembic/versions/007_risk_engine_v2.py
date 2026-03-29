"""Risk Engine v2: scoring metadata, plan snapshot, user timezone.

Revision ID: 007_risk_v2
Revises: 006_adherence
Create Date: 2026-03-22

Adds to daily_nutrition_adherence:
- scoring_version, data_confidence, primary_risk_reason, plan_snapshot

Adds to onboarding_profile:
- timezone
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_risk_v2"
down_revision: Union[str, None] = "006_adherence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- daily_nutrition_adherence: scoring metadata + plan snapshot --
    op.add_column(
        "daily_nutrition_adherence",
        sa.Column("scoring_version", sa.Integer(), server_default="2", nullable=False),
    )
    op.add_column(
        "daily_nutrition_adherence",
        sa.Column("data_confidence", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "daily_nutrition_adherence",
        sa.Column("primary_risk_reason", sa.String(), nullable=True),
    )
    op.add_column(
        "daily_nutrition_adherence",
        sa.Column("plan_snapshot", sa.String(), nullable=True),
    )

    # -- onboarding_profile: user timezone --
    op.add_column(
        "onboarding_profile",
        sa.Column("timezone", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("onboarding_profile", "timezone")
    op.drop_column("daily_nutrition_adherence", "plan_snapshot")
    op.drop_column("daily_nutrition_adherence", "primary_risk_reason")
    op.drop_column("daily_nutrition_adherence", "data_confidence")
    op.drop_column("daily_nutrition_adherence", "scoring_version")
