"""collage maker: collages + collage_layers

Revision ID: 0002_collages
Revises: 0001_initial
Create Date: 2026-07-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_collages"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "collages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("format", sa.String(length=10), nullable=False),
        sa.Column(
            "background_color",
            sa.String(length=9),
            nullable=False,
            server_default="#000000",
        ),
        sa.Column(
            "status", sa.String(length=10), nullable=False, server_default="draft"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("exported_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_collages_updated_at", "collages", ["updated_at"])
    op.create_index("ix_collages_status", "collages", ["status"])

    op.create_table(
        "collage_layers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "collage_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("collages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("one_off_path", sa.Text(), nullable=True),
        sa.Column("pos_x", sa.Float(), nullable=False),
        sa.Column("pos_y", sa.Float(), nullable=False),
        sa.Column("width", sa.Float(), nullable=False),
        sa.Column("height", sa.Float(), nullable=False),
        sa.Column("rotation", sa.Float(), nullable=False, server_default="0"),
        sa.Column("crop_x", sa.Float(), nullable=False, server_default="0"),
        sa.Column("crop_y", sa.Float(), nullable=False, server_default="0"),
        sa.Column("crop_width", sa.Float(), nullable=False, server_default="1"),
        sa.Column("crop_height", sa.Float(), nullable=False, server_default="1"),
        sa.Column(
            "border_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("z_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_collage_layers_collage_id", "collage_layers", ["collage_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_collage_layers_collage_id", table_name="collage_layers")
    op.drop_table("collage_layers")
    op.drop_index("ix_collages_status", table_name="collages")
    op.drop_index("ix_collages_updated_at", table_name="collages")
    op.drop_table("collages")
