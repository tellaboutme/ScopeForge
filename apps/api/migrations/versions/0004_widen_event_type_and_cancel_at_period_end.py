"""widen analysis_events.event_type; add subscriptions cancel_at_period_end/card_last4/card_brand

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # String(24) -> String(40) (see the risk log R012, the design notes
    # D039): "proposal_regenerate_succeeded"/"proposal_regenerate_failed"
    # (D033) are 27/30 chars, both over the original 24-char cap — invisible
    # against SQLite (no VARCHAR length enforcement) but a hard failure
    # (StringDataRightTruncation) on every proposal regeneration against a
    # real Postgres database. alter_column works directly on Postgres; on
    # SQLite (batch mode) Alembic recreates the table under the hood, which
    # is why this migration is written with op.alter_column rather than a
    # raw ALTER TABLE statement.
    with op.batch_alter_table("analysis_events") as batch_op:
        batch_op.alter_column(
            "event_type",
            existing_type=sa.String(length=24),
            type_=sa.String(length=40),
            existing_nullable=False,
        )

    # D039: cancel-at-period-end subscription state, additive and
    # nullable/defaulted so existing rows don't need backfilling.
    op.add_column(
        "subscriptions",
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("subscriptions", sa.Column("card_last4", sa.String(length=4), nullable=True))
    op.add_column("subscriptions", sa.Column("card_brand", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("subscriptions", "card_brand")
    op.drop_column("subscriptions", "card_last4")
    op.drop_column("subscriptions", "cancel_at_period_end")

    with op.batch_alter_table("analysis_events") as batch_op:
        batch_op.alter_column(
            "event_type",
            existing_type=sa.String(length=40),
            type_=sa.String(length=24),
            existing_nullable=False,
        )
