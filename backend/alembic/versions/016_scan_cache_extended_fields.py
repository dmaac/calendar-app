"""Add sugar_g, sodium_mg, serving_size, confidence to ai_scan_cache

Extends the AI scan cache with full nutrition fields that were previously
only stored in AIFoodLog. This prevents data loss on cache hits — previously
sugar_g, sodium_mg, serving_size, and confidence were discarded when a cached
result was returned.

All columns are nullable with no default since existing rows may not have
this data.

Revision ID: 016
"""

from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_scan_cache", sa.Column("sugar_g", sa.Float(), nullable=True))
    op.add_column("ai_scan_cache", sa.Column("sodium_mg", sa.Float(), nullable=True))
    op.add_column("ai_scan_cache", sa.Column("serving_size", sa.String(200), nullable=True))
    op.add_column("ai_scan_cache", sa.Column("confidence", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_scan_cache", "confidence")
    op.drop_column("ai_scan_cache", "serving_size")
    op.drop_column("ai_scan_cache", "sodium_mg")
    op.drop_column("ai_scan_cache", "sugar_g")
