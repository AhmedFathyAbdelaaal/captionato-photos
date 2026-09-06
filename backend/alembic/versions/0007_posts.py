"""posts table + collages.post_id/slide_order (multi-slide Instagram posts)

Revision ID: 0007_posts
Revises: 0006_tags_and_layer_lock
Create Date: 2026-09-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_posts"
down_revision: Union[str, None] = "0006_tags_and_layer_lock"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="draft"),
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

    # A collage with post_id set is a slide of that post.
    op.add_column(
        "collages",
        sa.Column(
            "post_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "collages",
        sa.Column("slide_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_collages_post_id", "collages", ["post_id"])


def downgrade() -> None:
    op.drop_index("ix_collages_post_id", table_name="collages")
    op.drop_column("collages", "slide_order")
    op.drop_column("collages", "post_id")
    op.drop_table("posts")
