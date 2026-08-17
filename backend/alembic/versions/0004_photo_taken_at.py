"""photos: add taken_at (EXIF capture date) + backfill from stored EXIF

Revision ID: 0004_photo_taken_at
Revises: 0003_photo_display
Create Date: 2026-08-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_photo_taken_at"
down_revision: Union[str, None] = "0003_photo_display"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True))
    # Backfill from the EXIF already stored on existing rows. Only parse values
    # in the canonical EXIF shape (YYYY:MM:DD HH:MM:SS) so a malformed field
    # can't break the migration.
    op.execute(
        r"""
        UPDATE photos
        SET taken_at = to_timestamp(exif->>'date_taken', 'YYYY:MM:DD HH24:MI:SS')
        WHERE exif ? 'date_taken'
          AND exif->>'date_taken' ~ '^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$'
        """
    )


def downgrade() -> None:
    op.drop_column("photos", "taken_at")
