"""galleries: add visibility + password_hash (public/unlisted/password)

Revision ID: 0005_gallery_visibility
Revises: 0004_photo_taken_at
Create Date: 2026-08-31
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_gallery_visibility"
down_revision: Union[str, None] = "0004_photo_taken_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "galleries",
        sa.Column(
            "visibility",
            sa.String(length=15),
            nullable=False,
            server_default="public",
        ),
    )
    op.add_column(
        "galleries", sa.Column("password_hash", sa.Text(), nullable=True)
    )
    # Index the visibility column so the public listing filter stays cheap.
    op.create_index(
        "ix_galleries_visibility", "galleries", ["visibility"]
    )


def downgrade() -> None:
    op.drop_index("ix_galleries_visibility", table_name="galleries")
    op.drop_column("galleries", "password_hash")
    op.drop_column("galleries", "visibility")
