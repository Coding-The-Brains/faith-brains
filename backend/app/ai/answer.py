"""Grounded answer engine (Sonnet 5).

Flow: classify -> retrieve -> generate with the retrieved sources inlined and numbered.
The model is instructed to answer ONLY from those sources and cite them as [n]; the API
returns the same numbered source list so the frontend can render citations verbatim.
"""

import asyncio
import logging
import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import guard
from app.ai.base import ChatProvider
from app.ai.provider import get_chat_provider
from app.ai.semantic_cache import get_semantic_cache
from app.content.personas import PERSONAS_BY_KEY
from app.retrieval.service import SearchService

log = logging.getLogger(__name__)

SOURCE_COUNT = 8
MAX_SOURCE_CHARS = 1500  # per-source truncation for long hadith
TAFSIR_PROMPT_CHARS = 800  # tafsir excerpt fed to the model per verse (kept tight for latency)
DEFAULT_EFFORT = "low"  # answer-model reasoning effort when the caller doesn't pick one
ALLOWED_EFFORTS = ("minimal", "low", "medium", "high")
HISTORY_TURNS = 6  # most recent turns kept as conversation context
HISTORY_TURN_CHARS = 1000  # per-turn truncation inside the prompt

_ANSWER_SYSTEM = """You are FaithBrains, an educational assistant for learning about Islam.

Grounding rules (strict):
- Answer ONLY from the numbered sources provided in the user message. Do not bring in outside claims, rulings, or hadith not present in the sources.
- Cite every claim with the source number in square brackets, e.g. [1] or [2][3].
- If the sources are insufficient to answer, say so plainly and suggest what the user could search for instead. Never fabricate a citation.
- Quote Quran and Hadith text verbatim when quoting; do not paraphrase inside quotation marks.
- Hadith sources may carry scholars' gradings. If a hadith you cite is graded Daif/weak or the graders disagree, say so explicitly (e.g. "this narration is graded weak by al-Albani") and prefer Sahih/Hasan sources when both cover the point. Never present a weak narration as established.
- Some sources include a Tafsir excerpt (classical scholarly commentary), an Occasion-of-revelation note (asbab al-nuzul), and revelation place (Meccan/Medinan). Use these to explain scholarly interpretation and historical context, attributing them in prose (e.g. "Ibn Kathir explains…", "Al-Wahidi reports it was revealed when…") while still citing the source number. Prefer the tafsir's interpretation over your own reasoning.

Religious-authority rules (strict):
- You are not a mufti and must never issue a fatwa, personal ruling, or verdict on a person's specific situation.
- Where scholars differ, present the difference neutrally rather than picking a side. When a tafsir notes more than one recognized interpretation, mention them.
- For anything touching a personal circumstance, explain the general teaching from the sources and direct the user to a qualified scholar for their specific case.

Style:
- Clear, respectful, and warm. Use ﷺ after the Prophet Muhammad's name.
- Concise prose; short paragraphs. No headers unless the answer is genuinely long.
- Never use an em dash (—). Use a comma, colon, or period instead.
- Answer in the language of the question."""

_FATWA_ADDENDUM = """

This question asks for a personal religious ruling. You MUST NOT provide one. Instead:
1. Acknowledge the question with empathy.
2. Explain the relevant general teachings found in the sources, with citations.
3. State clearly that this depends on personal circumstances you cannot judge, and that a qualified scholar or local imam should be consulted for their specific case."""


_NO_SOURCES_MESSAGE = (
    "I couldn't find relevant passages in the Quran or Hadith collections for "
    "that question. Try rephrasing it, or browse the Quran and Hadith tabs directly."
)

_CONDENSE_SYSTEM = (
    "You rewrite a conversational follow-up as one standalone question. Read the "
    "conversation, then restate the final follow-up so it can be understood with no "
    "prior context, in the same language, preserving the asker's intent. Output "
    "ONLY the rewritten question — no preamble, no quotes."
)

_CITATION_MARKER = re.compile(r"\[\d+\]")


def _persona_hint(persona: str | None) -> str:
    """Style/depth addendum for a known persona; empty string otherwise.

    Appended after the safety blocks — it must only tune voice, never rules.
    """
    p = PERSONAS_BY_KEY.get(persona or "")
    if not p:
        return ""
    return (
        "\n\nAudience adaptation (style and depth only — every grounding and "
        "religious-authority rule above still applies):\n" + p["prompt_hint"]
    )


def _transcript(history: list[dict]) -> str:
    """Recent turns as User:/Assistant: lines. Assistant turns lose their [n]
    markers — those numbers referred to a previous answer's source list and would
    collide with the fresh numbering in this turn's prompt."""
    lines = []
    for turn in history[-HISTORY_TURNS:]:
        who = "Assistant" if turn.get("role") == "assistant" else "User"
        content = _CITATION_MARKER.sub("", (turn.get("content") or "")).strip()
        lines.append(f"{who}: {content[:HISTORY_TURN_CHARS]}")
    return "\n".join(lines)


class AnswerService:
    def __init__(self, chat: ChatProvider | None = None, search: SearchService | None = None):
        self.chat = chat or get_chat_provider()
        self.search = search or SearchService()
        self.cache = get_semantic_cache()

    async def ask(
        self,
        session: AsyncSession,
        question: str,
        scope: str = "all",
        persona: str | None = None,
        history: list[dict] | None = None,
        effort: str = DEFAULT_EFFORT,
    ) -> dict:
        standalone = await self._condense(question, history)
        # Semantic cache: a near-identical question returns instantly (skips retrieval +
        # generation). Only single-turn, default-persona asks are cacheable — otherwise the
        # answer depends on history/persona and must not be shared across sessions.
        q_embedding = await self._cache_key(standalone, persona, history, effort)
        if q_embedding is not None:
            cached = await self.cache.get(q_embedding)
            if cached is not None:
                return cached

        # Classification (LLM) and retrieval (DB+embeddings) are independent — both only
        # need `standalone` — so run them concurrently instead of back-to-back. Reuse the
        # cache-lookup embedding for retrieval so a miss doesn't call Voyage twice.
        classification, retrieval = await asyncio.gather(
            guard.classify(standalone, self.chat),
            self.search.search(
                session, standalone, scope=scope, k=SOURCE_COUNT, query_embedding=q_embedding
            ),
        )

        if classification.category == "sensitive_crisis":
            return self._respond(classification, guard.CRISIS_RESPONSE, [])
        if classification.category == "out_of_scope":
            return self._respond(classification, guard.OUT_OF_SCOPE_RESPONSE, [])

        sources = retrieval["results"]
        if not sources:
            return self._respond(classification, _NO_SOURCES_MESSAGE, [])

        system = _ANSWER_SYSTEM
        if classification.category == "fatwa_seeking":
            system += _FATWA_ADDENDUM
        system += _persona_hint(persona)

        answer = await self.chat.text(
            model=self.chat.answer_model,
            system=system,
            user=self._build_prompt(question, sources, history),
            max_tokens=8000,
            # Caller-selected reasoning effort (default "low"). Grounded synthesis of
            # retrieved sources needs little reasoning — safety is handled upstream by the
            # classifier. minimal=fastest/thinner, low=fast+cited, medium/high=deeper+slower.
            effort=effort,
        )
        payload = self._respond(classification, answer.strip(), sources)
        if q_embedding is not None:
            await self.cache.put(q_embedding, payload)
        return payload

    async def ask_stream(
        self,
        session: AsyncSession,
        question: str,
        scope: str = "all",
        persona: str | None = None,
        history: list[dict] | None = None,
        effort: str = DEFAULT_EFFORT,
    ):
        """Same flow as ask(), but yields event dicts as work completes:
        {"event": "meta"} -> {"event": "sources"} -> {"event": "delta"}* -> {"event": "done"}.
        The done event carries the full ask() payload so callers can log it identically.
        Deterministic lanes (crisis / out-of-scope / no sources) skip straight to done."""
        standalone = await self._condense(question, history)
        # Semantic cache hit: replay the stored answer as one delta so the UI renders it
        # identically, then done. Skips retrieval + generation (see ask()).
        q_embedding = await self._cache_key(standalone, persona, history, effort)
        if q_embedding is not None:
            cached = await self.cache.get(q_embedding)
            if cached is not None:
                yield {"event": "meta", "category": cached["category"]}
                yield {"event": "sources", "sources": cached["sources"]}
                yield {"event": "delta", "text": cached["answer"]}
                yield {"event": "done", **cached}
                return

        # Classify and retrieve concurrently (see ask()); first token arrives sooner.
        classification, retrieval = await asyncio.gather(
            guard.classify(standalone, self.chat),
            self.search.search(
                session, standalone, scope=scope, k=SOURCE_COUNT, query_embedding=q_embedding
            ),
        )
        yield {"event": "meta", "category": classification.category}

        if classification.category == "sensitive_crisis":
            yield {"event": "done", **self._respond(classification, guard.CRISIS_RESPONSE, [])}
            return
        if classification.category == "out_of_scope":
            yield {"event": "done", **self._respond(classification, guard.OUT_OF_SCOPE_RESPONSE, [])}
            return

        sources = retrieval["results"]
        if not sources:
            yield {"event": "done", **self._respond(classification, _NO_SOURCES_MESSAGE, [])}
            return

        yield {"event": "sources", "sources": sources}

        system = _ANSWER_SYSTEM
        if classification.category == "fatwa_seeking":
            system += _FATWA_ADDENDUM
        system += _persona_hint(persona)

        parts: list[str] = []
        async for delta in self.chat.text_stream(
            model=self.chat.answer_model,
            system=system,
            user=self._build_prompt(question, sources, history),
            max_tokens=8000,
            effort=effort,  # caller-selected; see ask()
        ):
            parts.append(delta)
            yield {"event": "delta", "text": delta}

        payload = self._respond(classification, "".join(parts).strip(), sources)
        if q_embedding is not None:
            await self.cache.put(q_embedding, payload)
        yield {"event": "done", **payload}

    async def _cache_key(
        self, standalone: str, persona: str | None, history: list[dict] | None, effort: str
    ) -> list[float] | None:
        """Embedding used as the semantic-cache key, or None when this request must not be
        cached: persona/multi-turn answers are context-specific, and non-default efforts run
        fresh so each setting's real latency/quality is visible when testing on the site."""
        if persona or history or effort != DEFAULT_EFFORT:
            return None
        return await self.search.embed_query(standalone)

    async def _condense(self, question: str, history: list[dict] | None) -> str:
        """Rewrite a follow-up into a standalone question for classification and
        retrieval (elliptical follow-ups like "and how did he show it?" retrieve
        nothing on their own). The original question is still what gets displayed,
        stored, and answered. Falls back to the raw question on any failure."""
        if not history:
            return question
        try:
            standalone = await self.chat.text(
                model=self.chat.classifier_model,
                system=_CONDENSE_SYSTEM,
                user=f"{_transcript(history)}\n\nFollow-up: {question.strip()}",
                max_tokens=300,
                effort="low",
            )
            standalone = standalone.strip()
            if 3 <= len(standalone) <= 2000:
                return standalone
        except Exception:  # noqa: BLE001 — condense is best-effort by design
            log.warning("condense step failed; using the raw follow-up", exc_info=True)
        return question

    def _respond(self, classification, answer: str, sources: list) -> dict:
        return {
            "category": classification.category,
            "answer": answer,
            "sources": sources,
            "disclaimer": guard.STANDARD_DISCLAIMER,
        }

    def _build_prompt(
        self, question: str, sources: list[dict], history: list[dict] | None = None
    ) -> str:
        lines = []
        if history:
            lines.append(
                "Earlier conversation (context only — answer the final question and "
                "cite ONLY the numbered sources below):"
            )
            lines.append(_transcript(history))
            lines.append("")
        lines.append("Sources:")
        for i, s in enumerate(sources, start=1):
            if s["type"] == "quran":
                text = (s.get("translation") or "").strip()[:MAX_SOURCE_CHARS]
                src = s.get("translation_source") or s.get("translation_edition") or ""
                place = s.get("revelation_place")
                place_note = f", {place}" if place else ""
                trans_note = f" — trans. {src}" if src else ""
                lines.append(
                    f"[{i}] Quran {s['reference']} (Surah {s['surah_name']}{place_note}): "
                    f"“{text}”{trans_note} (Arabic: {s.get('arabic', '')})"
                )
                tafsir = (s.get("tafsir") or "").strip()
                if tafsir:
                    lines.append(
                        f"    Tafsir ({s.get('tafsir_source', 'classical commentary')}): "
                        f"“{tafsir[:TAFSIR_PROMPT_CHARS]}”"
                    )
                ctx = (s.get("context") or "").strip()
                if ctx:
                    lines.append(
                        f"    Occasion of revelation ({s.get('context_source', 'asbab al-nuzul')}): "
                        f"“{ctx[:TAFSIR_PROMPT_CHARS]}”"
                    )
            else:
                text = (s.get("english") or "").strip()[:MAX_SOURCE_CHARS]
                grades = ", ".join(
                    f"{g.get('name')}: {g.get('grade')}" for g in (s.get("gradings") or [])[:2]
                )
                grade_note = f" [Grading — {grades}]" if grades else ""
                narrator = s.get("narrator")
                narrator_note = f" (narrated by {narrator})" if narrator else ""
                lines.append(f"[{i}] {s['reference']}{narrator_note}{grade_note}: “{text}”")
        lines.append("")
        lines.append(f"Question: {question.strip()}")
        return "\n".join(lines)
