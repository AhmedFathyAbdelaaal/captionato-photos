"""comments (context-scoped, one level of replies) + photo_capys + admin read marker

Revision ID: 0010_comments_capys
Revises: 0009_user_can_download
Create Date: 2026-10-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_comments_capys"
down_revision: Union[str, None] = "0009_user_can_download"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "gallery_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("galleries.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "gallery_id IS NOT NULL OR photo_id IS NOT NULL", name="ck_comments_context"
        ),
    )
    # Thread lookups + per-photo counts within a context.
    op.create_index(
        "ix_comments_context", "comments", ["gallery_id", "photo_id", "created_at"]
    )
    op.create_index("ix_comments_photo_id", "comments", ["photo_id"])
    op.create_index("ix_comments_created_at", "comments", ["created_at"])
    op.create_index("ix_comments_user_created", "comments", ["user_id", "created_at"])

    op.create_table(
        "photo_capys",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_photo_capys_photo_id", "photo_capys", ["photo_id"])

    op.add_column(
        "users", sa.Column("comments_read_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "comments_read_at")
    op.drop_index("ix_photo_capys_photo_id", table_name="photo_capys")
    op.drop_table("photo_capys")
    op.drop_index("ix_comments_user_created", table_name="comments")
    op.drop_index("ix_comments_created_at", table_name="comments")
    op.drop_index("ix_comments_photo_id", table_name="comments")
    op.drop_index("ix_comments_context", table_name="comments")
    op.drop_table("comments")
