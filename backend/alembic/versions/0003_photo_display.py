"""photos: add display_path (lightbox derivative)

Revision ID: 0003_photo_display
Revises: 0002_collages
Create Date: 2026-08-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_photo_display"
down_revision: Union[str, None] = "0002_collages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: existing photos backfill lazily on first /display request.
    op.add_column("photos", sa.Column("display_path", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("photos", "display_path")
