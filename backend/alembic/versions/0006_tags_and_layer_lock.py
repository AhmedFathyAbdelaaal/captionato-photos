"""photos.tags (text[] + GIN) and collage_layers.locked

Revision ID: 0006_tags_and_layer_lock
Revises: 0005_gallery_visibility
Create Date: 2026-09-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_tags_and_layer_lock"
down_revision: Union[str, None] = "0005_gallery_visibility"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Photo tags — text[], never null, defaults to empty array.
    op.add_column(
        "photos",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    # GIN index makes `tag = ANY(tags)` / containment lookups cheap.
    op.create_index(
        "ix_photos_tags",
        "photos",
        ["tags"],
        postgresql_using="gin",
    )

    # Collage layer lock — freezes move/resize/rotate in the editor.
    op.add_column(
        "collage_layers",
        sa.Column(
            "locked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("collage_layers", "locked")
    op.drop_index("ix_photos_tags", table_name="photos")
    op.drop_column("photos", "tags")
