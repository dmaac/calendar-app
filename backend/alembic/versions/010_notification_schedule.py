"""Create notification_schedule table for per-user notification preferences.

Revision ID: 010_notif_schedule
Revises: 009_progress
Create Date: 2026-03-22

Tables: notification_schedule
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_notif_schedule"
down_revision: Union[str, None] = "009_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_schedule",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, unique=True),

        # Master toggle
        sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default="true"),

        # Meal reminders
        sa.Column("meal_reminders_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("breakfast_reminder_hour", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("breakfast_reminder_minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lunch_reminder_hour", sa.Integer(), nullable=False, server_default="13"),
        sa.Column("lunch_reminder_minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dinner_reminder_hour", sa.Integer(), nullable=False, server_default="19"),
        sa.Column("dinner_reminder_minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("snack_reminder_hour", sa.Integer(), nullable=False, server_default="16"),
        sa.Column("snack_reminder_minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("use_predicted_times", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("reminder_lead_minutes", sa.Integer(), nullable=False, server_default="15"),

        # Evening summary
        sa.Column("evening_summary_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("evening_summary_hour", sa.Integer(), nullable=False, server_default="21"),
        sa.Column("evening_summary_minute", sa.Integer(), nullable=False, server_default="0"),

        # Streak alerts
        sa.Column("streak_alerts_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("streak_risk_hour", sa.Integer(), nullable=False, server_default="18"),
        sa.Column("streak_risk_minute", sa.Integer(), nullable=False, server_default="0"),

        # Streak celebrations
        sa.Column("streak_celebrations_enabled", sa.Boolean(), nullable=False, server_default="true"),

        # Inactivity
        sa.Column("inactivity_nudge_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("inactivity_days_threshold", sa.Integer(), nullable=False, server_default="2"),

        # Water reminders
        sa.Column("water_reminders_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("water_reminder_interval_hours", sa.Integer(), nullable=False, server_default="2"),

        # Timestamps
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index(
        "ix_notification_schedule_user_id",
        "notification_schedule",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_notification_schedule_user_id", table_name="notification_schedule")
    op.drop_table("notification_schedule")
