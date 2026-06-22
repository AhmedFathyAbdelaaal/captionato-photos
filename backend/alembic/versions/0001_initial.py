"""initial schema: photos, galleries, gallery_photos, admin_users

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("original_path", sa.Text(), nullable=False),
        sa.Column("thumb_path", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("exif", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_photos_visible", "photos", ["visible"])
    op.create_index("ix_photos_uploaded_at", "photos", ["uploaded_at"])

    op.create_table(
        "galleries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "cover_photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("photos.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("layout", sa.String(length=20), nullable=False, server_default="masonry"),
        sa.Column("force_theme", sa.String(length=10), nullable=False, server_default="system"),
        sa.Column("accent_color", sa.String(length=9), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_galleries_slug", "galleries", ["slug"], unique=True)
    op.create_index("ix_galleries_display_order", "galleries", ["display_order"])

    op.create_table(
        "gallery_photos",
        sa.Column(
            "gallery_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("galleries.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "admin_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.Text(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
    )
    op.create_index("ix_admin_users_username", "admin_users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_table("admin_users")
    op.drop_table("gallery_photos")
    op.drop_index("ix_galleries_display_order", table_name="galleries")
    op.drop_index("ix_galleries_slug", table_name="galleries")
    op.drop_table("galleries")
    op.drop_index("ix_photos_uploaded_at", table_name="photos")
    op.drop_index("ix_photos_visible", table_name="photos")
    op.drop_table("photos")
