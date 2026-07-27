"""Postgres-backed semantic answer cache.

A question near-identical (by embedding cosine similarity) to one already answered
returns the stored answer, skipping retrieval + generation. Backed by the
`semantic_cache` table (pgvector HNSW), so it survives restarts and is shared
across workers. Fail-open by design: any DB problem means a cache miss / skipped
store — never a broken answer.

ponytail: pruned to the newest MAX_ENTRIES on every put (one cheap DELETE on a
tiny table); add TTL/hit-based eviction only if the cache ever needs to be big.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import text

from app.db.engine import get_sessionmaker

log = logging.getLogger(__name__)

# Cosine threshold to count as "the same question". High on purpose: paraphrases of
# one question embed ~0.95+, distinct topics sit well below. Erring high avoids ever
# serving the wrong cached answer — the costly failure mode for this app.
SIMILARITY_THRESHOLD = 0.93
MAX_ENTRIES = 500


def _vec(embedding: list[float]) -> str:
    """pgvector literal: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{x:.7g}" for x in embedding) + "]"


class SemanticCache:
    def __init__(self, threshold: float = SIMILARITY_THRESHOLD, max_entries: int = MAX_ENTRIES):
        self.threshold = threshold
        self.max_entries = max_entries

    async def get(self, embedding: list[float]) -> dict | None:
        try:
            async with get_sessionmaker()() as s:
                row = (
                    await s.execute(
                        text(
                            "SELECT payload FROM semantic_cache "
                            "WHERE embedding <=> CAST(:emb AS vector) < :maxdist "
                            "ORDER BY embedding <=> CAST(:emb AS vector) LIMIT 1"
                        ),
                        {"emb": _vec(embedding), "maxdist": 1.0 - self.threshold},
                    )
                ).first()
            return row[0] if row else None
        except Exception:  # noqa: BLE001 — cache errors must never break answers
            log.warning("semantic cache get failed; treating as miss", exc_info=True)
            return None

    async def put(self, embedding: list[float], payload: dict) -> None:
        try:
            async with get_sessionmaker()() as s:
                await s.execute(
                    text(
                        "INSERT INTO semantic_cache (embedding, payload) "
                        "VALUES (CAST(:emb AS vector), CAST(:payload AS jsonb))"
                    ),
                    {"emb": _vec(embedding), "payload": json.dumps(payload)},
                )
                await s.execute(
                    text(
                        "DELETE FROM semantic_cache WHERE id NOT IN "
                        "(SELECT id FROM semantic_cache ORDER BY id DESC LIMIT :cap)"
                    ),
                    {"cap": self.max_entries},
                )
                await s.commit()
        except Exception:  # noqa: BLE001
            log.warning("semantic cache put failed; answer served uncached", exc_info=True)


_cache: SemanticCache | None = None


def get_semantic_cache() -> SemanticCache:
    global _cache
    if _cache is None:
        _cache = SemanticCache()
    return _cache


def _demo() -> None:
    """Self-check for the pure parts (vector literal + threshold math)."""
    assert _vec([1.0, -0.25]) == "[1,-0.25]"
    assert abs((1.0 - SIMILARITY_THRESHOLD) - 0.07) < 1e-9
    c = SemanticCache()
    assert c.threshold == SIMILARITY_THRESHOLD and c.max_entries == MAX_ENTRIES
    print("semantic_cache self-check OK (pure parts; get/put need the DB)")


if __name__ == "__main__":
    _demo()
