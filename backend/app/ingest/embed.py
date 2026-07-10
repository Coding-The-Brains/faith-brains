"""Generate embeddings for the default Quran translation and hadith English texts.

Resumable: only rows with embedding IS NULL are processed, so rerunning after an
interruption (or a rate-limit abort) continues where it left off.

Run:  uv run python -m app.ingest.embed
"""

import asyncio

from sqlalchemy import func, select, update

from app.ai.embeddings import Embedder, get_embedder
from app.db.engine import get_sessionmaker
from app.db.models import Edition, HadithRecord, QuranTranslation

BATCH = 96
# Hadith are long; free-tier Voyage caps 10K tokens/request-minute, so keep batches small.
# Gemini has no such cap — full batches keep the request count well under its daily quota.
HADITH_BATCH_VOYAGE = 24
# Free-tier Voyage rejects any single request over its 10K TPM quota, forever — a batch
# of long hadiths must also fit a char budget (~4 chars/token, with safety margin).
HADITH_CHAR_BUDGET_VOYAGE = 28_000
DEFAULT_TRANSLATION_KEY = "english_saheeh"
MAX_CHARS = 12000  # hadith outliers; Voyage context is generous but keep requests sane


async def reset_stale_embeddings(embedder: Embedder) -> None:
    """Vectors from different models are incompatible — wipe rows embedded by another
    model so the resumable pass re-embeds them with the active one."""
    async with get_sessionmaker()() as session:
        for table, label in ((QuranTranslation, "quran"), (HadithRecord, "hadith")):
            result = await session.execute(
                update(table)
                .where(table.embedding_model.is_not(None), table.embedding_model != embedder.model)
                .values(embedding=None, embedding_model=None)
            )
            if result.rowcount:
                print(
                    f"cleared {result.rowcount} {label} embeddings from a different model "
                    f"(active: {embedder.model})"
                )
        await session.commit()


async def embed_quran(embedder: Embedder) -> None:
    async with get_sessionmaker()() as session:
        edition_id = (
            await session.execute(
                select(Edition.id).where(Edition.key == DEFAULT_TRANSLATION_KEY)
            )
        ).scalar_one()
        remaining = (
            await session.execute(
                select(func.count()).where(
                    QuranTranslation.edition_id == edition_id,
                    QuranTranslation.embedding.is_(None),
                )
            )
        ).scalar()
        print(f"quran translations to embed: {remaining}")
        done = 0
        while True:
            rows = (
                (
                    await session.execute(
                        select(QuranTranslation)
                        .where(
                            QuranTranslation.edition_id == edition_id,
                            QuranTranslation.embedding.is_(None),
                        )
                        .order_by(QuranTranslation.id)
                        .limit(BATCH)
                    )
                )
                .scalars()
                .all()
            )
            if not rows:
                break
            vectors = await embedder.embed([r.text[:MAX_CHARS] for r in rows], "document")
            for row, vec in zip(rows, vectors):
                row.embedding = vec
                row.embedding_model = embedder.model
            await session.commit()
            done += len(rows)
            print(f"  quran: {done}/{remaining}")


async def embed_hadith(embedder: Embedder) -> None:
    gemini = embedder.model.startswith("gemini")
    batch = BATCH if gemini else HADITH_BATCH_VOYAGE
    char_budget = None if gemini else HADITH_CHAR_BUDGET_VOYAGE
    async with get_sessionmaker()() as session:
        remaining = (
            await session.execute(
                select(func.count()).where(
                    HadithRecord.embedding.is_(None), HadithRecord.text_english.is_not(None)
                )
            )
        ).scalar()
        print(f"hadiths to embed: {remaining}")
        done = 0
        while True:
            rows = (
                (
                    await session.execute(
                        select(HadithRecord)
                        .where(
                            HadithRecord.embedding.is_(None),
                            HadithRecord.text_english.is_not(None),
                        )
                        .order_by(HadithRecord.id)
                        .limit(batch)
                    )
                )
                .scalars()
                .all()
            )
            if not rows:
                break
            if char_budget is not None:
                take, total = [], 0
                for r in rows:
                    chars = min(len(r.text_english), MAX_CHARS)
                    if take and total + chars > char_budget:
                        break
                    take.append(r)
                    total += chars
                rows = take
            vectors = await embedder.embed(
                [r.text_english[:MAX_CHARS] for r in rows], "document"
            )
            for row, vec in zip(rows, vectors):
                row.embedding = vec
                row.embedding_model = embedder.model
            await session.commit()
            done += len(rows)
            if done % (batch * 10) < batch:
                print(f"  hadith: {done}/{remaining}", flush=True)
        print(f"  hadith: {done}/{remaining}")


async def run() -> None:
    embedder = get_embedder()
    if not embedder.available:
        raise SystemExit(
            "no embedding key set — add GEMINI_API_KEY or VOYAGE_API_KEY to .env, then rerun"
        )
    print(f"embedding provider: {type(embedder).__name__} ({embedder.model}, dim={embedder.dim})")
    await reset_stale_embeddings(embedder)
    await embed_quran(embedder)
    await embed_hadith(embedder)
    print("embedding complete")


if __name__ == "__main__":
    asyncio.run(run())
