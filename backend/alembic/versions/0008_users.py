"""users (replaces admin_users) + user_galleries grants + assignment visibility

Existing admin accounts are copied into `users` with role=admin (same ids and
password hashes, so the admin login keeps working). Gallery visibility moves
from public/unlisted/password to assigned/password: public + unlisted become
`assigned` (visible only to users granted them), password stays password.

Revision ID: 0008_users
Revises: 0007_posts
Create Date: 2026-10-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_users"
down_revision: Union[str, None] = "0007_posts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ux_users_username_lower", "users", [sa.text("lower(username)")], unique=True
    )
    op.create_index("ix_users_role", "users", ["role"])

    op.execute(
        "INSERT INTO users (id, username, password_hash, role) "
        "SELECT id, username, password_hash, 'admin' FROM admin_users"
    )
    op.drop_table("admin_users")

    op.create_table(
        "user_galleries",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "gallery_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("galleries.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("ix_user_galleries_gallery_id", "user_galleries", ["gallery_id"])

    op.execute(
        "UPDATE galleries SET visibility = 'assigned' "
        "WHERE visibility IN ('public', 'unlisted')"
    )
    op.alter_column("galleries", "visibility", server_default="assigned")


def downgrade() -> None:
    op.alter_column("galleries", "visibility", server_default="public")
    op.execute("UPDATE galleries SET visibility = 'public' WHERE visibility = 'assigned'")

    op.drop_index("ix_user_galleries_gallery_id", table_name="user_galleries")
    op.drop_table("user_galleries")

    op.create_table(
        "admin_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.Text(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
    )
    op.execute(
        "INSERT INTO admin_users (id, username, password_hash) "
        "SELECT id, username, password_hash FROM users WHERE role = 'admin'"
    )
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ux_users_username_lower", table_name="users")
    op.drop_table("users")
