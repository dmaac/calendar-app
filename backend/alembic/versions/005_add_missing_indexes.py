"""Add missing indexes on activity.user_id, workoutlog.user_id, userfoodfavorite.food_id, subscription.store_tx_id.

Revision ID: 005_add_missing_indexes
Revises: 004_add_is_admin_and_feedback
Create Date: 2026-03-22

Indexes added
-------------
1. ix_activity_user_id        -- activity(user_id)
   Activities are always queried by user. The FK existed but had no index.

2. ix_workoutlog_user_id      -- workoutlog(user_id)
   Workout queries always filter by user_id. The composite index
   ix_workoutlog_user_created existed but a single-column index on user_id
   is useful for COUNT queries and JOINs.

3. ix_userfoodfavorite_food_id -- userfoodfavorite(food_id)
   Used when deleting a food to cascade-check favorites, and when
   querying "who favorited this food?".

4. ix_subscription_store_tx_id -- subscription(store_tx_id)
   Store transaction IDs are looked up during receipt validation
   (Apple/Google) to detect duplicate purchases.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_add_missing_indexes"
down_revision: Union[str, None] = "004_add_is_admin_and_feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_activity_user_id",
        "activity",
        ["user_id"],
        unique=False,
    )

    op.create_index(
        "ix_workoutlog_user_id",
        "workoutlog",
        ["user_id"],
        unique=False,
    )

    op.create_index(
        "ix_userfoodfavorite_food_id",
        "userfoodfavorite",
        ["food_id"],
        unique=False,
    )

    op.create_index(
        "ix_subscription_store_tx_id",
        "subscription",
        ["store_tx_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_store_tx_id", table_name="subscription")
    op.drop_index("ix_userfoodfavorite_food_id", table_name="userfoodfavorite")
    op.drop_index("ix_workoutlog_user_id", table_name="workoutlog")
    op.drop_index("ix_activity_user_id", table_name="activity")
