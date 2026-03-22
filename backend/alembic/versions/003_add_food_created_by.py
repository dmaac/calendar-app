"""Add created_by column to food table."""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "003_add_food_created_by"
down_revision: Union[str, None] = "002_add_performance_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("food", sa.Column("created_by", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_food_created_by_user", "food", "user", ["created_by"], ["id"], ondelete="SET NULL")
    op.create_index("ix_food_created_by", "food", ["created_by"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_food_created_by", table_name="food")
    op.drop_constraint("fk_food_created_by_user", "food", type_="foreignkey")
    op.drop_column("food", "created_by")
