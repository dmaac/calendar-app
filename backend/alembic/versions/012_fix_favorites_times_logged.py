"""Add times_logged column to userfoodfavorite table.

Revision ID: 012_fix_fav_times
Revises: 011_adaptive_cal
Create Date: 2026-03-22

The UserFoodFavorite model declares times_logged but it was never added
to the table in the initial migration. This column tracks how many times
a user has quick-logged a favorite food.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_fix_fav_times"
down_revision: Union[str, None] = "011_adaptive_cal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "userfoodfavorite",
        sa.Column("times_logged", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("userfoodfavorite", "times_logged")
