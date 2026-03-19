"""Initial schema — creates all tables from scratch.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-03-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("hashed_password", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default="email"),
        sa.Column("provider_id", sa.String(), nullable=True),
        sa.Column("is_premium", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)
    op.create_index("ix_user_provider_id", "user", ["provider_id"], unique=False)

    # ── activity ───────────────────────────────────────────────────────────────
    op.create_table(
        "activity",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="scheduled"),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── food ───────────────────────────────────────────────────────────────────
    op.create_table(
        "food",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("brand", sa.String(), nullable=True),
        sa.Column("serving_size", sa.Float(), nullable=False, server_default="100.0"),
        sa.Column("serving_unit", sa.String(), nullable=False, server_default="g"),
        sa.Column("calories", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("fat_g", sa.Float(), nullable=False),
        sa.Column("fiber_g", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("sugar_g", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_food_name", "food", ["name"], unique=False)

    # ── meal_log ───────────────────────────────────────────────────────────────
    op.create_table(
        "meallog",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(), nullable=False),
        sa.Column("food_id", sa.Integer(), nullable=False),
        sa.Column("servings", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("total_calories", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_protein", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_carbs", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_fat", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_fiber", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_sugar", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["food_id"], ["food.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── userfoodfavorite ───────────────────────────────────────────────────────
    op.create_table(
        "userfoodfavorite",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("food_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["food_id"], ["food.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_userfoodfavorite_user_id", "userfoodfavorite", ["user_id"], unique=False)

    # ── usernutritionprofile ───────────────────────────────────────────────────
    op.create_table(
        "usernutritionprofile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("activity_level", sa.String(), nullable=False, server_default="moderately_active"),
        sa.Column("goal", sa.String(), nullable=False, server_default="maintain"),
        sa.Column("target_calories", sa.Float(), nullable=False, server_default="2000.0"),
        sa.Column("target_protein_g", sa.Float(), nullable=False, server_default="150.0"),
        sa.Column("target_carbs_g", sa.Float(), nullable=False, server_default="250.0"),
        sa.Column("target_fat_g", sa.Float(), nullable=False, server_default="65.0"),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── dailynutritionsummary ──────────────────────────────────────────────────
    op.create_table(
        "dailynutritionsummary",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("total_calories", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_protein", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_carbs", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_fat", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("target_calories", sa.Float(), nullable=False, server_default="2000.0"),
        sa.Column("water_ml", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_summary_user_date"),
    )
    op.create_index("ix_daily_summary_user_date", "dailynutritionsummary", ["user_id", "date"], unique=False)
    op.create_index("ix_dailynutritionsummary_user_id", "dailynutritionsummary", ["user_id"], unique=False)

    # ── onboarding_profile ─────────────────────────────────────────────────────
    op.create_table(
        "onboarding_profile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("workouts_per_week", sa.Integer(), nullable=True),
        sa.Column("heard_from", sa.String(), nullable=True),
        sa.Column("used_other_apps", sa.Boolean(), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("unit_system", sa.String(), nullable=False, server_default="metric"),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("goal", sa.String(), nullable=True),
        sa.Column("target_weight_kg", sa.Float(), nullable=True),
        sa.Column("weekly_speed_kg", sa.Float(), nullable=False, server_default="0.8"),
        sa.Column("pain_points", sa.Text(), nullable=True),
        sa.Column("diet_type", sa.String(), nullable=True),
        sa.Column("accomplishments", sa.Text(), nullable=True),
        sa.Column("health_connected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("referral_code", sa.String(), nullable=True),
        sa.Column("daily_calories", sa.Integer(), nullable=True),
        sa.Column("daily_carbs_g", sa.Integer(), nullable=True),
        sa.Column("daily_protein_g", sa.Integer(), nullable=True),
        sa.Column("daily_fats_g", sa.Integer(), nullable=True),
        sa.Column("health_score", sa.Float(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_onboarding_profile_user_id", "onboarding_profile", ["user_id"], unique=True)

    # ── subscription ───────────────────────────────────────────────────────────
    op.create_table(
        "subscription",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("price_paid", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
        sa.Column("discount_pct", sa.Integer(), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(), nullable=True),
        sa.Column("current_period_ends_at", sa.DateTime(), nullable=True),
        sa.Column("store", sa.String(), nullable=True),
        sa.Column("store_tx_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subscription_user_id", "subscription", ["user_id"], unique=False)

    # ── ai_food_log ────────────────────────────────────────────────────────────
    op.create_table(
        "ai_food_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("logged_at", sa.DateTime(), nullable=False),
        sa.Column("meal_type", sa.String(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("image_hash", sa.String(), nullable=True),
        sa.Column("food_name", sa.String(), nullable=False),
        sa.Column("calories", sa.Float(), nullable=False),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("fats_g", sa.Float(), nullable=False),
        sa.Column("fiber_g", sa.Float(), nullable=True),
        sa.Column("sugar_g", sa.Float(), nullable=True),
        sa.Column("sodium_mg", sa.Float(), nullable=True),
        sa.Column("serving_size", sa.String(), nullable=True),
        sa.Column("ai_provider", sa.String(), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("ai_raw_response", sa.Text(), nullable=True),
        sa.Column("was_edited", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_food_log_user_id", "ai_food_log", ["user_id"], unique=False)
    op.create_index("ix_ai_food_log_image_hash", "ai_food_log", ["image_hash"], unique=False)
    op.create_index("ix_ai_food_log_user_logged_at", "ai_food_log", ["user_id", "logged_at"], unique=False)
    op.create_index("ix_ai_food_log_user_meal_type", "ai_food_log", ["user_id", "meal_type"], unique=False)

    # ── ai_scan_cache ──────────────────────────────────────────────────────────
    op.create_table(
        "ai_scan_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("image_hash", sa.String(), nullable=False),
        sa.Column("food_name", sa.String(), nullable=False),
        sa.Column("calories", sa.Float(), nullable=False),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("fats_g", sa.Float(), nullable=False),
        sa.Column("fiber_g", sa.Float(), nullable=True),
        sa.Column("ai_provider", sa.String(), nullable=False),
        sa.Column("ai_response", sa.Text(), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("image_hash"),
    )
    op.create_index("ix_ai_scan_cache_image_hash", "ai_scan_cache", ["image_hash"], unique=True)


def downgrade() -> None:
    op.drop_table("ai_scan_cache")
    op.drop_table("ai_food_log")
    op.drop_table("subscription")
    op.drop_table("onboarding_profile")
    op.drop_table("dailynutritionsummary")
    op.drop_table("usernutritionprofile")
    op.drop_table("userfoodfavorite")
    op.drop_table("meallog")
    op.drop_table("food")
    op.drop_table("activity")
    op.drop_table("user")
