"""Audit trail for admin hadith changes: who, when, before/after snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hadith_revisions",
        sa.Column("id", sa.Integer, primary_key=True),
        # SET NULL so history (incl. the snapshot) survives a record's deletion
        sa.Column(
            "record_id",
            sa.Integer,
            sa.ForeignKey("hadith_records.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("changed_by", sa.BigInteger, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.Text, nullable=False),  # add | edit | delete
        sa.Column("reference", sa.Text, nullable=False),  # "bukhari 6018", denormalized
        sa.Column("before", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("after", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column(
            "changed_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.create_index("ix_hadith_revisions_changed", "hadith_revisions", ["changed_at"])
    op.create_index("ix_hadith_revisions_record", "hadith_revisions", ["record_id"])


def downgrade() -> None:
    op.drop_index("ix_hadith_revisions_record", table_name="hadith_revisions")
    op.drop_index("ix_hadith_revisions_changed", table_name="hadith_revisions")
    op.drop_table("hadith_revisions")
