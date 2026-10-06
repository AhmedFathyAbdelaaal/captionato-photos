"""users.can_download ("Elevated": may download originals anywhere they can see)

Revision ID: 0009_user_can_download
Revises: 0008_users
Create Date: 2026-10-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_user_can_download"
down_revision: Union[str, None] = "0008_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("can_download", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "can_download")
