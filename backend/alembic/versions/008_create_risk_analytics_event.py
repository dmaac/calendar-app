"""Create risk_analytics_event table for tracking risk-related user interactions.

Revision ID: 008_risk_analytics
Revises: 007_risk_v2
Create Date: 2026-03-22

Table: risk_analytics_event
- Stores lightweight analytics events (impressions, CTA clicks, interventions)
- Indexes on user_id, event_type, created_at, and (user_id, event_type)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_risk_analytics"
down_revision: Union[str, None] = "007_risk_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "risk_analytics_event",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_risk_event_user_id", "risk_analytics_event", ["user_id"])
    op.create_index("ix_risk_event_type", "risk_analytics_event", ["event_type"])
    op.create_index("ix_risk_event_created_at", "risk_analytics_event", ["created_at"])
    op.create_index("ix_risk_event_user_type", "risk_analytics_event", ["user_id", "event_type"])


def downgrade() -> None:
    op.drop_index("ix_risk_event_user_type", table_name="risk_analytics_event")
    op.drop_index("ix_risk_event_created_at", table_name="risk_analytics_event")
    op.drop_index("ix_risk_event_type", table_name="risk_analytics_event")
    op.drop_index("ix_risk_event_user_id", table_name="risk_analytics_event")
    op.drop_table("risk_analytics_event")
