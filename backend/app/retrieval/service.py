"""Hybrid search orchestration.

Order of resolution:
1. Exact reference short-circuit ("2:255", "baqarah 255", "bukhari 6018") -> direct lookup.
2. Hybrid retrieval: English full-text + semantic vectors + Arabic trigram (when the query
   contains Arabic), fused with Reciprocal Rank Fusion per corpus.

Every result carries which signals produced it, so the API/frontend can show provenance
and so degraded modes (no embeddings yet) are visible instead of silent.
"""

import asyncio
import logging
import re
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.embeddings import Embedder, EmbeddingsUnavailable, get_embedder
from app.db.engine import get_sessionmaker
from app.db.models import (
    Edition,
    HadithCollection,
    HadithRecord,
    QuranTranslation,
    QuranVerse,
    Surah,
    Tafsir,
)
from app.retrieval import fulltext, vector
from app.retrieval.arabic import contains_arabic, normalize_arabic
from app.retrieval.hadith_meta import extract_isnad, extract_narrator
from app.retrieval.reference import (
    parse_hadith_reference,
    parse_quran_reference,
    surah_name_matches,
)

log = logging.getLogger(__name__)

DEFAULT_TRANSLATION_KEY = "english_saheeh"
RRF_K = 60


# Meta-words of question phrasing ("what does the QURAN SAY about X") that appear in
# thousands of verses/hadith and drown the actual topic in lexical ranking.
_META_WORDS = frozenset(
    "quran koran verse verses ayah ayat aya surah sura chapter hadith hadiths sunnah "
    "say says said saying tell tells told mention mentions mentioned "
    "teach teaches taught teaching according islam islamic".split()
)


def _content_query(query: str) -> str:
    """Strip question meta-words before lexical search; keep the original when nothing
    was stripped (preserves websearch operators) or nothing would remain."""
    tokens = re.findall(r"[A-Za-z']+", query)
    kept = [t for t in tokens if t.lower() not in _META_WORDS]
    if not kept or len(kept) == len(tokens):
        return query
    return " ".join(kept)


def _or_fallback_query(query: str) -> str | None:
    """Question-phrased queries fail websearch AND semantics ("what does the quran say
    about X" requires every non-stopword to match). Fall back to OR over the words so
    the best partial matches still surface; ts_rank_cd ranks fuller matches higher."""
    tokens = re.findall(r"[A-Za-z]{3,}", query)
    if len(tokens) < 2:
        return None
    return " OR ".join(tokens)


def rrf_fuse(rank_lists: dict[str, list[int]], k0: int = RRF_K) -> dict[int, dict]:
    """Fuse best-first id lists into {id: {"score": float, "signals": [name, ...]}}."""
    fused: dict[int, dict] = defaultdict(lambda: {"score": 0.0, "signals": []})
    for signal_name, ids in rank_lists.items():
        for rank, doc_id in enumerate(ids):
            fused[doc_id]["score"] += 1.0 / (k0 + rank + 1)
            fused[doc_id]["signals"].append(signal_name)
    return dict(fused)


class SearchService:
    def __init__(self, embedder: Embedder | None = None):
        self.embedder = embedder or get_embedder()

    async def search(
        self,
        session: AsyncSession,
        query: str,
        scope: str = "all",  # all | quran | hadith
        k: int = 20,
        translation_key: str = DEFAULT_TRANSLATION_KEY,
        query_embedding: list[float] | None = None,  # precomputed to skip a Voyage call
    ) -> dict:
        query = query.strip()
        if not query:
            return {"mode": "empty", "signals_used": [], "results": []}

        # 1. Reference short-circuits
        if scope in ("all", "quran"):
            qref = parse_quran_reference(query)
            if qref is not None:
                hits = await self._resolve_quran_ref(session, qref, translation_key)
                if hits:
                    return {"mode": "reference", "signals_used": ["reference"], "results": hits}
        if scope in ("all", "hadith"):
            href = parse_hadith_reference(query)
            if href is not None:
                hits = await self._resolve_hadith_ref(session, href)
                if hits:
                    return {"mode": "reference", "signals_used": ["reference"], "results": hits}

        # 2. Hybrid retrieval. The edition lookup (DB) and query embedding (Voyage HTTP
        # call) are independent, so overlap them; only edition_id touches the session.
        # A caller may pass a precomputed embedding (semantic cache) to skip the Voyage call.
        if query_embedding is None:
            edition_id, query_embedding = await asyncio.gather(
                self._edition_id(session, translation_key),
                self.embed_query(query),
            )
        else:
            edition_id = await self._edition_id(session, translation_key)
        arabic_q = normalize_arabic(query) if contains_arabic(query) else None
        fetch_k = max(k * 3, 30)  # overfetch per signal so fusion has material to work with

        signals_used: set[str] = set()
        ft_query = _content_query(query)
        or_query = _or_fallback_query(ft_query)

        async def quran_block(sess: AsyncSession) -> list[dict]:
            if not (scope in ("all", "quran") and edition_id is not None):
                return []
            rank_lists: dict[str, list[int]] = {}
            ft = await fulltext.fulltext_quran(sess, ft_query, edition_id, fetch_k)
            if not ft and or_query:
                ft = await fulltext.fulltext_quran(sess, or_query, edition_id, fetch_k)
            if ft:
                rank_lists["fulltext"] = [i for i, _ in ft]
            if query_embedding is not None:
                vs = await vector.vector_quran(
                    sess, query_embedding, edition_id, fetch_k, self.embedder.model
                )
                if vs:
                    rank_lists["vector"] = [i for i, _ in vs]
            if arabic_q:
                ar = await fulltext.arabic_quran(sess, arabic_q, fetch_k)
                if ar:
                    rank_lists["arabic"] = [i for i, _ in ar]
            signals_used.update(rank_lists)
            top = sorted(rrf_fuse(rank_lists).items(), key=lambda kv: kv[1]["score"], reverse=True)[:k]
            return await self._hydrate_quran(sess, top, translation_key)

        async def hadith_block(sess: AsyncSession) -> list[dict]:
            if scope not in ("all", "hadith"):
                return []
            rank_lists: dict[str, list[int]] = {}
            ft = await fulltext.fulltext_hadith(sess, ft_query, fetch_k)
            if not ft and or_query:
                ft = await fulltext.fulltext_hadith(sess, or_query, fetch_k)
            if ft:
                rank_lists["fulltext"] = [i for i, _ in ft]
            if query_embedding is not None:
                vs = await vector.vector_hadith(sess, query_embedding, fetch_k, self.embedder.model)
                if vs:
                    rank_lists["vector"] = [i for i, _ in vs]
            if arabic_q:
                ar = await fulltext.arabic_hadith(sess, arabic_q, fetch_k)
                if ar:
                    rank_lists["arabic"] = [i for i, _ in ar]
            signals_used.update(rank_lists)
            top = sorted(rrf_fuse(rank_lists).items(), key=lambda kv: kv[1]["score"], reverse=True)[:k]
            return await self._hydrate_hadith(sess, top)

        # Quran and Hadith retrieval are independent; run them concurrently. A single
        # AsyncSession can't multiplex queries, so the second block gets its own
        # connection. When only one corpus is in scope, reuse the request session.
        if scope == "all":
            async with get_sessionmaker()() as session2:
                quran_res, hadith_res = await asyncio.gather(
                    quran_block(session), hadith_block(session2)
                )
            results = quran_res + hadith_res
        else:
            results = await quran_block(session) + await hadith_block(session)

        results.sort(key=lambda r: r["score"], reverse=True)
        return {
            "mode": "hybrid",
            "signals_used": sorted(signals_used),
            "results": results[:k],
        }

    async def embed_query(self, query: str) -> list[float] | None:
        """Query embedding for the vector signal, or None when embeddings are
        unavailable (degrades to lexical-only search instead of failing)."""
        if not self.embedder.available:
            return None
        try:
            return await self.embedder.embed_query(query)
        except EmbeddingsUnavailable as exc:
            log.warning("vector signal skipped: %s", exc)
            return None

    # -- reference resolution ------------------------------------------------

    async def _resolve_quran_ref(self, session, ref, translation_key: str) -> list[dict]:
        surah_number = ref.surah
        if surah_number is None and ref.surah_name:
            stmt = select(Surah.number, Surah.name_transliterated, Surah.name_english)
            rows = (await session.execute(stmt)).all()
            matches = [
                number
                for number, tname, ename in rows
                if surah_name_matches(ref.surah_name, tname, ename)
            ]
            if len(matches) != 1:  # ambiguous or no match -> fall through to hybrid search
                return []
            surah_number = matches[0]

        end = ref.ayah_end or ref.ayah_start
        if end < ref.ayah_start or end - ref.ayah_start > 30:
            end = ref.ayah_start
        stmt = (
            select(QuranVerse)
            .options(selectinload(QuranVerse.surah))
            .where(
                QuranVerse.surah_number == surah_number,
                QuranVerse.ayah_number.between(ref.ayah_start, end),
            )
            .order_by(QuranVerse.ayah_number)
        )
        verses = (await session.execute(stmt)).scalars().all()
        items = [(v.id, {"score": 1.0, "signals": ["reference"]}) for v in verses]
        return await self._hydrate_quran(session, items, translation_key)

    async def _resolve_hadith_ref(self, session, ref) -> list[dict]:
        stmt = (
            select(HadithRecord)
            .join(HadithCollection)
            .options(selectinload(HadithRecord.collection))
            .where(
                HadithCollection.key == ref.collection_key,
                HadithRecord.hadith_number == ref.number,
            )
        )
        records = (await session.execute(stmt)).scalars().all()
        items = [(r.id, {"score": 1.0, "signals": ["reference"]}) for r in records]
        return await self._hydrate_hadith(session, items)

    # -- hydration -------------------------------------------------------------

    async def _edition_id(self, session, key: str) -> int | None:
        return (
            await session.execute(select(Edition.id).where(Edition.key == key))
        ).scalar_one_or_none()

    async def _hydrate_quran(self, session, scored_ids, translation_key: str) -> list[dict]:
        if not scored_ids:
            return []
        ids = [i for i, _ in scored_ids]
        meta = dict(scored_ids)
        stmt = (
            select(QuranVerse)
            .options(
                selectinload(QuranVerse.surah),
                selectinload(QuranVerse.translations).selectinload(QuranTranslation.edition),
            )
            .where(QuranVerse.id.in_(ids))
        )
        verses = {v.id: v for v in (await session.execute(stmt)).scalars().all()}
        # Attach per-verse commentary in one query: asbab al-nuzul rows become `context`
        # (occasion of revelation), everything else is `tafsir` (first source_key wins).
        tafsirs: dict[int, Tafsir] = {}
        contexts: dict[int, Tafsir] = {}
        for t in (
            await session.execute(
                select(Tafsir).where(Tafsir.verse_id.in_(ids)).order_by(Tafsir.source_key)
            )
        ).scalars():
            bucket = contexts if "asbab" in t.source_key else tafsirs
            bucket.setdefault(t.verse_id, t)
        out = []
        for vid in ids:
            v = verses.get(vid)
            if v is None:
                continue
            tr = next((t for t in v.translations if t.edition.key == translation_key), None)
            taf = tafsirs.get(vid)
            ctx = contexts.get(vid)
            out.append(
                {
                    "type": "quran",
                    "score": meta[vid]["score"],
                    "signals": meta[vid]["signals"],
                    "reference": f"{v.surah_number}:{v.ayah_number}",
                    "surah": v.surah_number,
                    "ayah": v.ayah_number,
                    "surah_name": v.surah.name_transliterated,
                    "surah_name_arabic": v.surah.name_arabic,
                    "arabic": v.text_uthmani,
                    "translation": tr.text if tr else None,
                    "translation_edition": translation_key if tr else None,
                    "translation_source": tr.edition.name if tr else None,  # human-readable
                    "revelation_place": v.surah.revelation_place or None,  # Meccan | Medinan
                    "tafsir": taf.text if taf else None,
                    "tafsir_source": taf.source_name if taf else None,
                    "context": ctx.text if ctx else None,  # asbab al-nuzul
                    "context_source": ctx.source_name if ctx else None,
                    "juz": v.juz,
                    "page": v.page,
                }
            )
        return out

    async def _hydrate_hadith(self, session, scored_ids) -> list[dict]:
        if not scored_ids:
            return []
        ids = [i for i, _ in scored_ids]
        meta = dict(scored_ids)
        stmt = (
            select(HadithRecord)
            .options(selectinload(HadithRecord.collection))
            .where(HadithRecord.id.in_(ids))
        )
        records = {r.id: r for r in (await session.execute(stmt)).scalars().all()}
        out = []
        for hid in ids:
            r = records.get(hid)
            if r is None:
                continue
            out.append(
                {
                    "type": "hadith",
                    "score": meta[hid]["score"],
                    "signals": meta[hid]["signals"],
                    "reference": f"{r.collection.name_english} {r.hadith_number}",
                    "collection": r.collection.key,
                    "collection_name": r.collection.name_english,
                    "number": r.hadith_number,
                    "book_number": r.book_number,
                    "book_name": r.book_name,
                    "arabic": r.text_arabic,
                    "english": r.text_english,
                    "gradings": r.gradings,
                    "narrator": extract_narrator(r.text_english),
                    "isnad": extract_isnad(r.text_arabic),
                }
            )
        return out
