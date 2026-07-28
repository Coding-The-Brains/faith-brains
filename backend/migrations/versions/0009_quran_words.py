"""Word-by-word Quran: per-word Arabic, translation, and transliteration.

Lazily filled from the quran.com v4 API the first time an ayah's words are
requested, then served from here forever.
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quran_words",
        sa.Column("surah", sa.Integer, primary_key=True),
        sa.Column("ayah", sa.Integer, primary_key=True),
        sa.Column("position", sa.Integer, primary_key=True),
        sa.Column("arabic", sa.Text, nullable=False),
        sa.Column("translation", sa.Text, nullable=False),
        sa.Column("transliteration", sa.Text, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("quran_words")
