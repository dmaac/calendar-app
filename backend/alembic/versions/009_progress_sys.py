"""Create progress system tables for gamification.

Revision ID: 009_progress
Revises: 008_risk_analytics
Create Date: 2026-03-22

Tables: user_progress_profile, achievement_definition, user_achievement,
        daily_mission, user_daily_mission_status, weekly_challenge,
        user_weekly_challenge_status, progress_event, reward_catalog,
        user_reward_redemption
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_progress"
down_revision: Union[str, None] = "008_risk_analytics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── user_progress_profile ────────────────────────────────────────────
    op.create_table(
        "user_progress_profile",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, unique=True),
        sa.Column("nutrition_xp_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("nutrition_level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("current_streak_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("best_streak_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("streak_freezes_available", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("fitsia_coins_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_progress_event_at", sa.DateTime(), nullable=True),
        sa.Column("motivation_state", sa.String(20), nullable=False, server_default="new"),
        sa.Column("active_season_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_progress_profile_user_id", "user_progress_profile", ["user_id"])

    # ── achievement_definition ───────────────────────────────────────────
    op.create_table(
        "achievement_definition",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("rarity", sa.String(20), nullable=False, server_default="common"),
        sa.Column("icon", sa.String(40), nullable=False, server_default="trophy"),
        sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("coins_reward", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("condition_type", sa.String(40), nullable=False),
        sa.Column("condition_value", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_achievement_def_code", "achievement_definition", ["code"])
    op.create_index("ix_achievement_def_category", "achievement_definition", ["category"])

    # ── user_achievement ─────────────────────────────────────────────────
    op.create_table(
        "user_achievement",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("achievement_id", sa.Integer(), sa.ForeignKey("achievement_definition.id"), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
    )
    op.create_index("ix_user_achievement_user_id", "user_achievement", ["user_id"])
    op.create_index("ix_user_achievement_pair", "user_achievement", ["user_id", "achievement_id"])

    # ── daily_mission ────────────────────────────────────────────────────
    op.create_table(
        "daily_mission",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("coins_reward", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("condition_type", sa.String(40), nullable=False),
        sa.Column("condition_value", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("difficulty", sa.String(20), nullable=False, server_default="easy"),
        sa.Column("target_audience", sa.String(20), nullable=False, server_default="all"),
    )
    op.create_index("ix_daily_mission_code", "daily_mission", ["code"])

    # ── user_daily_mission_status ────────────────────────────────────────
    op.create_table(
        "user_daily_mission_status",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("mission_id", sa.Integer(), sa.ForeignKey("daily_mission.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("progress_value", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "mission_id", "date", name="uq_user_mission_date"),
    )
    op.create_index("ix_daily_mission_status_user", "user_daily_mission_status", ["user_id"])
    op.create_index("ix_daily_mission_status_date", "user_daily_mission_status", ["date"])

    # ── weekly_challenge ─────────────────────────────────────────────────
    op.create_table(
        "weekly_challenge",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("coins_reward", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("condition_type", sa.String(40), nullable=False),
        sa.Column("condition_value", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("difficulty", sa.String(20), nullable=False, server_default="medium"),
    )
    op.create_index("ix_weekly_challenge_code", "weekly_challenge", ["code"])

    # ── user_weekly_challenge_status ─────────────────────────────────────
    op.create_table(
        "user_weekly_challenge_status",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("challenge_id", sa.Integer(), sa.ForeignKey("weekly_challenge.id"), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("progress_value", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "challenge_id", "week_start", name="uq_user_challenge_week"),
    )
    op.create_index("ix_weekly_challenge_status_user", "user_weekly_challenge_status", ["user_id"])
    op.create_index("ix_weekly_challenge_status_week", "user_weekly_challenge_status", ["week_start"])

    # ── progress_event ───────────────────────────────────────────────────
    op.create_table(
        "progress_event",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("xp_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("coins_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_progress_event_user_id", "progress_event", ["user_id"])
    op.create_index("ix_progress_event_type", "progress_event", ["event_type"])
    op.create_index("ix_progress_event_created", "progress_event", ["created_at"])
    op.create_index("ix_progress_event_user_type", "progress_event", ["user_id", "event_type"])

    # ── reward_catalog ───────────────────────────────────────────────────
    op.create_table(
        "reward_catalog",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("cost_coins", sa.Integer(), nullable=False),
        sa.Column("reward_type", sa.String(40), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="-1"),
    )
    op.create_index("ix_reward_catalog_code", "reward_catalog", ["code"])

    # ── user_reward_redemption ───────────────────────────────────────────
    op.create_table(
        "user_reward_redemption",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("reward_id", sa.Integer(), sa.ForeignKey("reward_catalog.id"), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("coins_spent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_reward_redemption_user_id", "user_reward_redemption", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_reward_redemption")
    op.drop_table("reward_catalog")
    op.drop_table("progress_event")
    op.drop_table("user_weekly_challenge_status")
    op.drop_table("weekly_challenge")
    op.drop_table("user_daily_mission_status")
    op.drop_table("daily_mission")
    op.drop_table("user_achievement")
    op.drop_table("achievement_definition")
    op.drop_table("user_progress_profile")
