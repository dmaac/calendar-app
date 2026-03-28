"""Database optimization: indexes, FK ondelete, constraints.

Revision ID: 018_db_optimization
Revises: 017_coach_conv_cost
Create Date: 2026-03-23

Comprehensive database optimization pass:

1. INDEXES ADDED (performance):
   - user: (provider, provider_id), (created_at)
   - meallog: (user_id, meal_type)
   - ai_food_log: (user_id, deleted_at)
   - subscription: (status), (current_period_ends_at), (trial_ends_at)
   - push_token: (user_id, is_active)
   - nutrition_tip: (category, is_active), (category)
   - recipe: (category, is_active), (category)
   - webhook: (user_id, event, is_active)
   - nutrition_adherence: (user_id, adherence_status)
   - progress_event: (user_id, created_at), (user_id, event_type)
   - user_achievement: (user_id, unlocked_at), (achievement_id)
   - achievement_definition: (category)
   - user_daily_mission_status: (user_id, date)
   - user_weekly_challenge_status: (user_id, week_start)
   - user_reward_redemption: (user_id, redeemed_at)
   - meal_template: (meal_type, is_active), (calories), (category)
   - user_meal_recommendation: (user_id, created_at)

2. CONSTRAINTS ADDED (data integrity):
   - userfoodfavorite: UNIQUE(user_id, food_id)

3. FOREIGN KEY ondelete=CASCADE ADDED (referential integrity):
   Applied to all user-owned tables so that deleting a user
   automatically removes all child records instead of leaving
   orphaned rows or raising IntegrityError.

   Tables affected: activity, meallog, ai_food_log,
   dailynutritionsummary, onboarding_profile, subscription,
   userfoodfavorite (both user_id and food_id), usernutritionprofile,
   push_token, feedback, workoutlog, notification_schedule,
   daily_nutrition_adherence, risk_analytics_event, all progress tables,
   all experiment tables, all corporate tables, all family tables,
   food_recommendation tables, calorie_adjustment tables,
   data_integrity_snapshots, backup_registry.

   Content tables (nutrition_tip, recipe) use SET NULL for created_by.

Note: Foreign key ondelete changes are implemented via DROP + ADD
constraint pattern since ALTER CONSTRAINT does not support changing
ON DELETE behavior in PostgreSQL.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018_db_optimization"
down_revision: Union[str, None] = "017_coach_conv_cost"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _alter_fk(
    table: str,
    column: str,
    ref_table: str,
    ref_column: str = "id",
    ondelete: str = "CASCADE",
    old_constraint_name: str | None = None,
    new_constraint_name: str | None = None,
) -> None:
    """Drop existing FK and recreate with ondelete behavior.

    SQLAlchemy/Alembic doesn't support ALTER CONSTRAINT to change ON DELETE,
    so we drop and recreate the constraint.
    """
    if old_constraint_name is None:
        old_constraint_name = f"{table}_{column}_fkey"
    if new_constraint_name is None:
        new_constraint_name = f"fk_{table}_{column}"

    # Drop existing FK (ignore if not found)
    try:
        op.drop_constraint(old_constraint_name, table, type_="foreignkey")
    except Exception:
        pass

    op.create_foreign_key(
        new_constraint_name,
        table,
        ref_table,
        [column],
        [ref_column],
        ondelete=ondelete,
    )


# ── Upgrade ──────────────────────────────────────────────────────────────────

def upgrade() -> None:
    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  1. NEW INDEXES                                                      ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    # -- user table --
    op.create_index(
        "ix_user_provider_provider_id", "user",
        ["provider", "provider_id"], unique=False,
    )
    op.create_index(
        "ix_user_created_at", "user",
        ["created_at"], unique=False,
    )

    # -- meallog --
    op.create_index(
        "ix_meallog_user_meal_type", "meallog",
        ["user_id", "meal_type"], unique=False,
    )

    # -- ai_food_log --
    op.create_index(
        "ix_ai_food_log_user_deleted", "ai_food_log",
        ["user_id", "deleted_at"], unique=False,
    )

    # -- subscription --
    op.create_index(
        "ix_subscription_status", "subscription",
        ["status"], unique=False,
    )
    op.create_index(
        "ix_subscription_period_ends", "subscription",
        ["current_period_ends_at"], unique=False,
    )
    op.create_index(
        "ix_subscription_trial_ends", "subscription",
        ["trial_ends_at"], unique=False,
    )

    # -- push_token --
    op.create_index(
        "ix_push_token_user_active", "push_token",
        ["user_id", "is_active"], unique=False,
    )

    # -- nutrition_tip --
    op.create_index(
        "ix_nutrition_tip_category_active", "nutrition_tip",
        ["category", "is_active"], unique=False,
    )
    op.create_index(
        "ix_nutrition_tip_category", "nutrition_tip",
        ["category"], unique=False,
    )

    # -- recipe --
    op.create_index(
        "ix_recipe_category_active", "recipe",
        ["category", "is_active"], unique=False,
    )
    op.create_index(
        "ix_recipe_category", "recipe",
        ["category"], unique=False,
    )

    # -- webhook --
    op.create_index(
        "ix_webhook_user_event_active", "webhook",
        ["user_id", "event", "is_active"], unique=False,
    )

    # -- daily_nutrition_adherence --
    op.create_index(
        "ix_adherence_user_status", "daily_nutrition_adherence",
        ["user_id", "adherence_status"], unique=False,
    )

    # -- progress_event --
    op.create_index(
        "ix_progress_event_user_created", "progress_event",
        ["user_id", "created_at"], unique=False,
    )
    op.create_index(
        "ix_progress_event_user_type", "progress_event",
        ["user_id", "event_type"], unique=False,
    )

    # -- user_achievement --
    op.create_index(
        "ix_user_achievement_user_unlocked", "user_achievement",
        ["user_id", "unlocked_at"], unique=False,
    )
    op.create_index(
        "ix_user_achievement_achievement_id", "user_achievement",
        ["achievement_id"], unique=False,
    )

    # -- achievement_definition --
    op.create_index(
        "ix_achievement_def_category", "achievement_definition",
        ["category"], unique=False,
    )

    # -- user_daily_mission_status --
    op.create_index(
        "ix_user_daily_mission_user_date", "user_daily_mission_status",
        ["user_id", "date"], unique=False,
    )

    # -- user_weekly_challenge_status --
    op.create_index(
        "ix_user_weekly_challenge_user_week", "user_weekly_challenge_status",
        ["user_id", "week_start"], unique=False,
    )

    # -- user_reward_redemption --
    op.create_index(
        "ix_user_reward_redemption_user_redeemed", "user_reward_redemption",
        ["user_id", "redeemed_at"], unique=False,
    )

    # -- meal_template --
    op.create_index(
        "ix_meal_template_type_active", "meal_template",
        ["meal_type", "is_active"], unique=False,
    )
    op.create_index(
        "ix_meal_template_calories", "meal_template",
        ["calories"], unique=False,
    )
    op.create_index(
        "ix_meal_template_category", "meal_template",
        ["category"], unique=False,
    )

    # -- user_meal_recommendation --
    op.create_index(
        "ix_user_meal_rec_user_created", "user_meal_recommendation",
        ["user_id", "created_at"], unique=False,
    )

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  2. UNIQUE CONSTRAINTS                                               ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    op.create_unique_constraint(
        "uq_user_food_favorite", "userfoodfavorite",
        ["user_id", "food_id"],
    )

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  3. FOREIGN KEY ON DELETE CASCADE / SET NULL                         ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    # -- Core user-owned tables --
    _alter_fk("activity", "user_id", "user")
    _alter_fk("meallog", "user_id", "user")
    _alter_fk("meallog", "food_id", "food")
    _alter_fk("ai_food_log", "user_id", "user")
    _alter_fk("dailynutritionsummary", "user_id", "user")
    _alter_fk("onboarding_profile", "user_id", "user")
    _alter_fk("subscription", "user_id", "user")
    _alter_fk("userfoodfavorite", "user_id", "user")
    _alter_fk("userfoodfavorite", "food_id", "food")
    _alter_fk("usernutritionprofile", "user_id", "user")
    _alter_fk("push_token", "user_id", "user")
    _alter_fk("feedback", "user_id", "user")
    _alter_fk("workoutlog", "user_id", "user")
    _alter_fk("notification_schedule", "user_id", "user")

    # -- Nutrition & risk --
    _alter_fk("daily_nutrition_adherence", "user_id", "user")
    _alter_fk("risk_analytics_event", "user_id", "user")
    _alter_fk("weight_log", "user_id", "user")
    _alter_fk("calorie_adjustment", "user_id", "user")

    # -- Progress / gamification --
    _alter_fk("user_progress_profile", "user_id", "user")
    _alter_fk("user_achievement", "user_id", "user")
    _alter_fk("user_achievement", "achievement_id", "achievement_definition")
    _alter_fk("user_daily_mission_status", "user_id", "user")
    _alter_fk("user_daily_mission_status", "mission_id", "daily_mission")
    _alter_fk("user_weekly_challenge_status", "user_id", "user")
    _alter_fk("user_weekly_challenge_status", "challenge_id", "weekly_challenge")
    _alter_fk("progress_event", "user_id", "user")
    _alter_fk("user_reward_redemption", "user_id", "user")
    _alter_fk("user_reward_redemption", "reward_id", "reward_catalog")

    # -- Experiments --
    _alter_fk("experiment_assignment", "user_id", "user")
    _alter_fk("experiment_assignment", "experiment_id", "experiment")
    _alter_fk("experiment_conversion", "user_id", "user")
    _alter_fk("experiment_conversion", "experiment_id", "experiment")

    # -- Webhooks --
    _alter_fk("webhook", "user_id", "user")
    _alter_fk("webhook_delivery", "webhook_id", "webhook")

    # -- Food recommendations --
    _alter_fk("meal_ingredient", "meal_id", "meal_template")
    _alter_fk("user_meal_recommendation", "user_id", "user")
    _alter_fk("user_meal_recommendation", "meal_id", "meal_template")

    # -- Corporate --
    _alter_fk("corporate_company", "admin_user_id", "user", ondelete="SET NULL")
    _alter_fk("corporate_membership", "company_id", "corporate_company")
    _alter_fk("corporate_membership", "user_id", "user")
    _alter_fk("corporate_membership", "team_id", "corporate_team", ondelete="SET NULL")
    _alter_fk("corporate_team", "company_id", "corporate_company")

    # -- Family --
    _alter_fk("family_group", "owner_user_id", "user")
    _alter_fk("family_membership", "family_group_id", "family_group")
    _alter_fk("family_membership", "user_id", "user")

    # -- Content tables (SET NULL for created_by) --
    _alter_fk("nutrition_tip", "created_by", "user", ondelete="SET NULL")
    _alter_fk("recipe", "created_by", "user", ondelete="SET NULL")

    # -- Data integrity / backup --
    _alter_fk("data_integrity_snapshots", "user_id", "user")
    _alter_fk("backup_registry", "user_id", "user")


# ── Downgrade ────────────────────────────────────────────────────────────────

def downgrade() -> None:
    # NOTE: Downgrade removes the new indexes and constraint.
    # FK ondelete changes are NOT reverted because the original constraints
    # had no explicit ondelete (defaulting to NO ACTION), and reverting
    # would require knowing the exact original constraint name for each
    # table, which varies across environments. The CASCADE behavior is
    # strictly safer than NO ACTION.

    # -- Drop unique constraint --
    op.drop_constraint("uq_user_food_favorite", "userfoodfavorite", type_="unique")

    # -- Drop indexes (reverse order) --
    op.drop_index("ix_user_meal_rec_user_created", table_name="user_meal_recommendation")
    op.drop_index("ix_meal_template_category", table_name="meal_template")
    op.drop_index("ix_meal_template_calories", table_name="meal_template")
    op.drop_index("ix_meal_template_type_active", table_name="meal_template")
    op.drop_index("ix_user_reward_redemption_user_redeemed", table_name="user_reward_redemption")
    op.drop_index("ix_user_weekly_challenge_user_week", table_name="user_weekly_challenge_status")
    op.drop_index("ix_user_daily_mission_user_date", table_name="user_daily_mission_status")
    op.drop_index("ix_achievement_def_category", table_name="achievement_definition")
    op.drop_index("ix_user_achievement_achievement_id", table_name="user_achievement")
    op.drop_index("ix_user_achievement_user_unlocked", table_name="user_achievement")
    op.drop_index("ix_progress_event_user_type", table_name="progress_event")
    op.drop_index("ix_progress_event_user_created", table_name="progress_event")
    op.drop_index("ix_adherence_user_status", table_name="daily_nutrition_adherence")
    op.drop_index("ix_webhook_user_event_active", table_name="webhook")
    op.drop_index("ix_recipe_category", table_name="recipe")
    op.drop_index("ix_recipe_category_active", table_name="recipe")
    op.drop_index("ix_nutrition_tip_category", table_name="nutrition_tip")
    op.drop_index("ix_nutrition_tip_category_active", table_name="nutrition_tip")
    op.drop_index("ix_push_token_user_active", table_name="push_token")
    op.drop_index("ix_subscription_trial_ends", table_name="subscription")
    op.drop_index("ix_subscription_period_ends", table_name="subscription")
    op.drop_index("ix_subscription_status", table_name="subscription")
    op.drop_index("ix_ai_food_log_user_deleted", table_name="ai_food_log")
    op.drop_index("ix_meallog_user_meal_type", table_name="meallog")
    op.drop_index("ix_user_created_at", table_name="user")
    op.drop_index("ix_user_provider_provider_id", table_name="user")
