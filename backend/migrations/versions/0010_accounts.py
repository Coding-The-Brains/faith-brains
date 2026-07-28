"""Accounts: users + DB-backed auth tokens; learners claimable by a user.

The anonymous learner stays the unit of data ownership. An account simply
claims learners (learners.user_id), so sign-in on a new device merges that
device's anonymous data into the account's primary learner.
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.create_table(
        "auth_tokens",
        sa.Column("token", sa.Text, primary_key=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.add_column("learners", sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id")))
    op.create_index("ix_learners_user", "learners", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_learners_user")
    op.drop_column("learners", "user_id")
    op.drop_table("auth_tokens")
    op.drop_table("users")
