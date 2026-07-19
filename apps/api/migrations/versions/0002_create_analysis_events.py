"""create analysis_events table

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("analysis_id", sa.String(length=64), nullable=True),
        sa.Column("installation_id", sa.String(length=64), nullable=True),
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_analysis_events_analysis_id", "analysis_events", ["analysis_id"])
    op.create_index("ix_analysis_events_installation_id", "analysis_events", ["installation_id"])
    op.create_index("ix_analysis_events_created_at", "analysis_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analysis_events_created_at", table_name="analysis_events")
    op.drop_index("ix_analysis_events_installation_id", table_name="analysis_events")
    op.drop_index("ix_analysis_events_analysis_id", table_name="analysis_events")
    op.drop_table("analysis_events")
