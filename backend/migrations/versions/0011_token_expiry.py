"""Auth tokens expire (30-day sliding window refreshed at login)."""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "auth_tokens",
        sa.Column(
            "expires_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now() + interval '30 days'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("auth_tokens", "expires_at")
