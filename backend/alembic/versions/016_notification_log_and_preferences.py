"""Add notification_log table and enhance notification_schedule with quiet hours,
weekly summary, goal milestone and achievement notification preferences.

Revision ID: 016_notif_log_prefs
Revises: 015_backup_registry
Create Date: 2026-03-23

Tables created: notification_log
Tables altered: notification_schedule (new columns)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016_notif_log_prefs"
down_revision: Union[str, None] = "015_backup_registry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- notification_log table -----------------------------------------------
    op.create_table(
        "notification_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),

        # Classification
        sa.Column("notification_type", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False, server_default="transactional"),

        # Content
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("data_json", sa.Text(), nullable=True),

        # Delivery
        sa.Column("channel", sa.String(), nullable=False, server_default="push"),
        sa.Column("expo_ticket_id", sa.String(), nullable=True),
        sa.Column("delivery_status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("failure_reason", sa.String(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),

        # Idempotency
        sa.Column("idempotency_key", sa.String(), nullable=False, unique=True),

        # Analytics timestamps
        sa.Column("sent_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(), nullable=True),
    )

    op.create_index("ix_notification_log_user_id", "notification_log", ["user_id"])
    op.create_index("ix_notification_log_user_type", "notification_log", ["user_id", "notification_type"])
    op.create_index("ix_notification_log_sent_at", "notification_log", ["sent_at"])
    op.create_index("ix_notification_log_idempotency_key", "notification_log", ["idempotency_key"], unique=True)
    op.create_index("ix_notification_log_notification_type", "notification_log", ["notification_type"])

    # -- notification_schedule enhancements -----------------------------------

    # Quiet hours
    op.add_column("notification_schedule",
                   sa.Column("quiet_hours_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("notification_schedule",
                   sa.Column("quiet_hours_start", sa.Integer(), nullable=False, server_default="22"))
    op.add_column("notification_schedule",
                   sa.Column("quiet_hours_end", sa.Integer(), nullable=False, server_default="8"))

    # Timezone offset
    op.add_column("notification_schedule",
                   sa.Column("timezone_offset_minutes", sa.Integer(), nullable=False, server_default="0"))

    # Weekly summary
    op.add_column("notification_schedule",
                   sa.Column("weekly_summary_enabled", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("notification_schedule",
                   sa.Column("weekly_summary_day", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("notification_schedule",
                   sa.Column("weekly_summary_hour", sa.Integer(), nullable=False, server_default="9"))
    op.add_column("notification_schedule",
                   sa.Column("weekly_summary_minute", sa.Integer(), nullable=False, server_default="0"))

    # Goal milestones
    op.add_column("notification_schedule",
                   sa.Column("goal_milestones_enabled", sa.Boolean(), nullable=False, server_default="true"))

    # Achievement notifications
    op.add_column("notification_schedule",
                   sa.Column("achievement_notifications_enabled", sa.Boolean(), nullable=False, server_default="true"))


def downgrade() -> None:
    # Drop added columns from notification_schedule
    op.drop_column("notification_schedule", "achievement_notifications_enabled")
    op.drop_column("notification_schedule", "goal_milestones_enabled")
    op.drop_column("notification_schedule", "weekly_summary_minute")
    op.drop_column("notification_schedule", "weekly_summary_hour")
    op.drop_column("notification_schedule", "weekly_summary_day")
    op.drop_column("notification_schedule", "weekly_summary_enabled")
    op.drop_column("notification_schedule", "timezone_offset_minutes")
    op.drop_column("notification_schedule", "quiet_hours_end")
    op.drop_column("notification_schedule", "quiet_hours_start")
    op.drop_column("notification_schedule", "quiet_hours_enabled")

    # Drop notification_log
    op.drop_index("ix_notification_log_notification_type", table_name="notification_log")
    op.drop_index("ix_notification_log_idempotency_key", table_name="notification_log")
    op.drop_index("ix_notification_log_sent_at", table_name="notification_log")
    op.drop_index("ix_notification_log_user_type", table_name="notification_log")
    op.drop_index("ix_notification_log_user_id", table_name="notification_log")
    op.drop_table("notification_log")
