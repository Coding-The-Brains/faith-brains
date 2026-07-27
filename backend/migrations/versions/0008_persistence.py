"""Durable semantic answer cache + shared rate-limit counters.

Both previously lived in process memory (emptied on restart, not shared across
workers). Postgres is the infra we already run, so it backs both now.
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE semantic_cache (
            id BIGSERIAL PRIMARY KEY,
            embedding vector(1024) NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_semcache_embedding_hnsw ON semantic_cache "
        "USING hnsw (embedding vector_cosine_ops)"
    )
    op.create_table(
        "rate_counters",
        sa.Column("key", sa.Text, primary_key=True),
        sa.Column("window_start", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("count", sa.Integer, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("rate_counters")
    op.execute("DROP TABLE semantic_cache")
