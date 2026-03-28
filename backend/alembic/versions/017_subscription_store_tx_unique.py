"""Add unique constraint on subscription.store_tx_id

Prevents duplicate receipt processing / replay attacks. A store_tx_id
should only ever be associated with one subscription row. The application
layer already checks for duplicates, but the DB constraint is the
authoritative enforcement.

NULL store_tx_id values are allowed (legacy rows) since UNIQUE constraints
in PostgreSQL permit multiple NULLs by default.

Revision ID: 017
"""

from alembic import op
import sqlalchemy as sa


revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add unique constraint on store_tx_id to prevent duplicate receipts.
    # This is safe even if duplicate store_tx_id values already exist,
    # because the application-layer duplicate check (added in the security
    # audit on 2026-03-21) should have prevented new duplicates.
    #
    # If this migration fails due to existing duplicates, run:
    #   DELETE FROM subscription WHERE id NOT IN (
    #     SELECT MIN(id) FROM subscription GROUP BY store_tx_id
    #   ) AND store_tx_id IS NOT NULL;
    op.create_unique_constraint(
        "uq_subscription_store_tx_id",
        "subscription",
        ["store_tx_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_subscription_store_tx_id", "subscription", type_="unique")
