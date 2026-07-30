"""Admin role on users + admin-written notes pinned to Quran/hadith references."""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.create_table(
        "content_notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("kind", sa.Text, nullable=False),  # quran | hadith
        sa.Column("reference", sa.Text, nullable=False),  # "2:255" | "bukhari 6018"
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_by", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.create_index("ix_content_notes_ref", "content_notes", ["kind", "reference"])


def downgrade() -> None:
    op.drop_index("ix_content_notes_ref", table_name="content_notes")
    op.drop_table("content_notes")
    op.drop_column("users", "is_admin")
