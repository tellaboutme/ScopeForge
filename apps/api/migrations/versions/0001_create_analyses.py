"""create analyses table

Revision ID: 0001
Revises:
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analyses",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("installation_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_title", sa.String(length=140), nullable=True),
        sa.Column("source_platform", sa.String(length=40), nullable=True),
        sa.Column("source_description", sa.String(length=30000), nullable=False),
        sa.Column("analysis_json", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="complete"),
        sa.Column("failure_code", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_analyses_installation_id", "analyses", ["installation_id"])
    op.create_index("ix_analyses_created_at", "analyses", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analyses_created_at", table_name="analyses")
    op.drop_index("ix_analyses_installation_id", table_name="analyses")
    op.drop_table("analyses")
