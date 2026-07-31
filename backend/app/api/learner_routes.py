"""Anonymous learner endpoints: saved items + learning paths with progress.

Identity is a client-minted UUID in the X-Session-Id header (no accounts, no
belief profiling). A future auth layer can claim learners.session_id rows.
"""

import logging
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import schemas
from app.content.learning_paths import PATHS, PATHS_BY_KEY, QUIZZES
from app.content.personas import PERSONAS
from app.db.engine import get_session
from app.db.models import (
    AuthToken,
    Conversation,
    Edition,
    HadithCollection,
    HadithRecord,
    Learner,
    Message,
    PathProgress,
    QuranTranslation,
    QuranVerse,
    SavedItem,
)
from app.retrieval.service import DEFAULT_TRANSLATION_KEY

log = logging.getLogger(__name__)

router = APIRouter()

_SESSION_RE = re.compile(r"[A-Za-z0-9-]{8,64}")


async def get_learner(
    x_session_id: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    fb_token: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
) -> Learner:
    # Signed-in requests (httpOnly cookie, or Bearer for API clients) resolve to
    # the account's primary learner, so data follows the account across devices.
    # Expired/stale tokens fall back to the anonymous session.
    token = fb_token or (
        authorization.removeprefix("Bearer ").strip()
        if authorization and authorization.startswith("Bearer ")
        else None
    )
    if token:
        claimed = (
            await session.execute(
                select(Learner)
                .join(AuthToken, AuthToken.user_id == Learner.user_id)
                .where(AuthToken.token == token, AuthToken.expires_at > datetime.now(UTC))
                .order_by(Learner.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()
        if claimed is not None:
            claimed.last_seen_at = datetime.now(UTC)
            await session.commit()
            return claimed
    if not x_session_id or not _SESSION_RE.fullmatch(x_session_id):
        raise HTTPException(400, "X-Session-Id header required (client-generated UUID)")
    learner = (
        await session.execute(select(Learner).where(Learner.session_id == x_session_id))
    ).scalar_one_or_none()
    if learner is not None and learner.user_id is not None:
        # Invariant: a bare session id must NEVER reach account data — that is
        # only reachable with a valid token. This learner was claimed by an
        # account (register/login on this device), so retire its session id and
        # hand the signed-out device a fresh, empty anonymous learner.
        learner.session_id = f"{x_session_id}.claimed.{learner.id}"
        await session.flush()
        learner = None
    if learner is None:
        # Upsert handles two first-requests racing on the same fresh session id
        await session.execute(
            pg_insert(Learner)
            .values(session_id=x_session_id)
            .on_conflict_do_nothing(index_elements=["session_id"])
        )
        learner = (
            await session.execute(select(Learner).where(Learner.session_id == x_session_id))
        ).scalar_one()
    learner.last_seen_at = datetime.now(UTC)
    await session.commit()
    return learner


async def get_learner_optional(
    x_session_id: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    fb_token: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
) -> Learner | None:
    has_token = bool(fb_token or (authorization and authorization.startswith("Bearer ")))
    if not has_token and (not x_session_id or not _SESSION_RE.fullmatch(x_session_id)):
        return None
    try:
        return await get_learner(x_session_id, authorization, fb_token, session)
    except HTTPException:
        return None  # stale token + no session id: treat as signed out


# -- personas --------------------------------------------------------------------


@router.get("/personas", response_model=list[schemas.PersonaOut])
async def list_personas():
    """Public persona catalogue (labels, suggested questions, recommended paths).
    prompt_hint stays server-side."""
    return [
        schemas.PersonaOut(
            key=p["key"],
            label=p["label"],
            tagline=p["tagline"],
            suggested_questions=p["suggested_questions"],
            recommended_paths=p["recommended_paths"],
        )
        for p in PERSONAS
    ]


@router.put("/learner/persona", response_model=schemas.LearnerOut)
async def set_persona(
    body: schemas.LearnerPersonaIn,
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    learner.persona = body.persona
    await session.commit()
    return schemas.LearnerOut(session_id=learner.session_id, persona=learner.persona)


# -- saved items ---------------------------------------------------------------


@router.get("/saved", response_model=list[schemas.SavedItemOut])
async def list_saved(
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(SavedItem)
            .where(SavedItem.learner_id == learner.id)
            .order_by(SavedItem.created_at.desc())
        )
    ).scalars()
    return [schemas.SavedItemOut(kind=r.kind, reference=r.reference) for r in rows]


@router.post("/saved", response_model=list[schemas.SavedItemOut])
async def save_item(
    body: schemas.SavedItemIn,
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        pg_insert(SavedItem)
        .values(learner_id=learner.id, kind=body.kind, reference=body.reference.strip())
        .on_conflict_do_nothing(constraint="uq_saved_learner_ref")
    )
    await session.commit()
    return await list_saved(learner, session)


@router.delete("/saved", response_model=list[schemas.SavedItemOut])
async def unsave_item(
    kind: str = Query(..., pattern="^(quran|hadith)$"),
    reference: str = Query(..., min_length=1, max_length=100),
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        delete(SavedItem).where(
            SavedItem.learner_id == learner.id,
            SavedItem.kind == kind,
            SavedItem.reference == reference,
        )
    )
    await session.commit()
    return await list_saved(learner, session)


# -- conversations ----------------------------------------------------------------


async def _owned_conversation(
    session: AsyncSession, learner: Learner, conversation_id: int
) -> Conversation:
    conversation = (
        await session.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.learner_id == learner.id,
            )
        )
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(404, "conversation not found")
    return conversation


@router.get("/conversations", response_model=list[schemas.ConversationSummaryOut])
async def list_conversations(
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    msg_count = (
        select(func.count())
        .where(Message.conversation_id == Conversation.id)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(Conversation, msg_count)
            .where(Conversation.learner_id == learner.id)
            .order_by(Conversation.updated_at.desc())
            .limit(30)
        )
    ).all()
    return [
        schemas.ConversationSummaryOut(
            id=c.id,
            title=c.title,
            updated_at=c.updated_at.isoformat(),
            message_count=n,
        )
        for c, n in rows
    ]


@router.get("/conversations/{conversation_id}", response_model=schemas.ConversationDetailOut)
async def conversation_detail(
    conversation_id: int,
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    conversation = await _owned_conversation(session, learner, conversation_id)
    messages = (
        (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.id)
            )
        )
        .scalars()
        .all()
    )
    return schemas.ConversationDetailOut(
        id=conversation.id,
        title=conversation.title,
        messages=[
            schemas.MessageOut(
                role=m.role,
                content=m.content,
                category=m.category,
                sources=m.sources or [],
                created_at=m.created_at.isoformat(),
            )
            for m in messages
        ],
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int,
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    conversation = await _owned_conversation(session, learner, conversation_id)
    await session.execute(delete(Message).where(Message.conversation_id == conversation.id))
    await session.delete(conversation)
    await session.commit()


# -- learning paths --------------------------------------------------------------


async def _completed_steps(session: AsyncSession, learner: Learner | None, path_key: str) -> set[str]:
    if learner is None:
        return set()
    rows = (
        await session.execute(
            select(PathProgress.step_key).where(
                PathProgress.learner_id == learner.id, PathProgress.path_key == path_key
            )
        )
    ).scalars()
    return set(rows)


@router.get("/learn/paths", response_model=list[schemas.PathSummaryOut])
async def list_paths(
    learner: Learner | None = Depends(get_learner_optional),
    session: AsyncSession = Depends(get_session),
):
    out = []
    for p in PATHS:
        done = await _completed_steps(session, learner, p["key"])
        out.append(
            schemas.PathSummaryOut(
                key=p["key"],
                title=p["title"],
                description=p["description"],
                step_count=len(p["steps"]),
                completed_count=len(done & {s["key"] for s in p["steps"]}),
            )
        )
    return out


async def _hydrate_step(session: AsyncSession, step: dict, done: set[str]) -> schemas.PathStepOut:
    kind, ref = step["kind"], step["reference"]
    arabic = text = grading = None
    if kind == "quran":
        s, a = (int(x) for x in ref.split(":"))
        row = (
            await session.execute(
                select(QuranVerse.text_uthmani, QuranTranslation.text)
                .join(QuranTranslation, QuranTranslation.verse_id == QuranVerse.id)
                .join(Edition, Edition.id == QuranTranslation.edition_id)
                .where(
                    QuranVerse.surah_number == s,
                    QuranVerse.ayah_number == a,
                    Edition.key == DEFAULT_TRANSLATION_KEY,
                )
            )
        ).first()
        if row:
            arabic, text = row
    else:
        coll, num = ref.rsplit(" ", 1)
        rec = (
            await session.execute(
                select(HadithRecord)
                .join(HadithCollection)
                .where(HadithCollection.key == coll, HadithRecord.hadith_number == num)
            )
        ).scalar_one_or_none()
        if rec:
            text = rec.text_english
            g = (rec.gradings or [None])[0]
            grading = f"{g.get('name')}: {g.get('grade')}" if isinstance(g, dict) else None
    return schemas.PathStepOut(
        key=step["key"],
        title=step["title"],
        kind=kind,
        reference=ref,
        arabic=arabic,
        text=text,
        grading=grading,
        completed=step["key"] in done,
    )


@router.get("/learn/paths/{path_key}", response_model=schemas.PathDetailOut)
async def path_detail(
    path_key: str,
    learner: Learner | None = Depends(get_learner_optional),
    session: AsyncSession = Depends(get_session),
):
    p = PATHS_BY_KEY.get(path_key)
    if p is None:
        raise HTTPException(404, "learning path not found")
    done = await _completed_steps(session, learner, path_key)
    steps = [await _hydrate_step(session, s, done) for s in p["steps"]]
    return schemas.PathDetailOut(
        key=p["key"],
        title=p["title"],
        description=p["description"],
        steps=steps,
        quiz=QUIZZES.get(path_key, []),
        quiz_completed="quiz" in done,
    )


@router.post("/learn/paths/{path_key}/steps/{step_key}/complete", response_model=schemas.PathProgressOut)
async def complete_step(
    path_key: str,
    step_key: str,
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    if learner.user_id is None:
        # Product rule: progress belongs to an account. The UI gates this too,
        # but the client-side check alone was bypassable with a bare session id.
        raise HTTPException(401, "Sign in to save your progress.")
    p = PATHS_BY_KEY.get(path_key)
    valid = {s["key"] for s in p["steps"]} | ({"quiz"} if QUIZZES.get(path_key) else set()) if p else set()
    if p is None or step_key not in valid:
        raise HTTPException(404, "unknown path or step")
    await session.execute(
        pg_insert(PathProgress)
        .values(learner_id=learner.id, path_key=path_key, step_key=step_key)
        .on_conflict_do_nothing(constraint="uq_progress_step")
    )
    await session.commit()
    done = await _completed_steps(session, learner, path_key)
    return schemas.PathProgressOut(
        path_key=path_key, completed=sorted(done), step_count=len(p["steps"])
    )


_RECOMMEND_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "path_key": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["path_key", "reason"],
            },
        },
        "explore_query": {"type": ["string", "null"]},
    },
    "required": ["suggestions", "explore_query"],
}


def _rules_suggestions(learner: Learner, progress: dict[str, int]) -> list[dict]:
    """Deterministic fallback: in-progress paths, then persona picks, unstarted only."""
    persona_recs: list[str] = next(
        (p["recommended_paths"] for p in PERSONAS if p["key"] == learner.persona), []
    )
    keys = [k for k, done in progress.items() if 0 < done < len(PATHS_BY_KEY[k]["steps"])]
    keys += [k for k in persona_recs if progress.get(k, 0) == 0]
    keys += [p["key"] for p in PATHS if progress.get(p["key"], 0) == 0]
    seen: list[str] = []
    for k in keys:
        if k not in seen:
            seen.append(k)
    return [
        {
            "path_key": k,
            "reason": "Pick up where you left off."
            if 0 < progress.get(k, 0) < len(PATHS_BY_KEY[k]["steps"])
            else "A good fit for how you chose to learn.",
        }
        for k in seen[:3]
    ]


@router.get("/learn/recommend", response_model=schemas.RecommendOut)
async def recommend_next(
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    """Hybrid next-topic recommendations: the AI picks from the real path catalog using
    the learner's own questions + progress; deterministic persona/progress rules answer
    when the AI is unavailable or has nothing to go on. AI output is validated against
    the catalog server-side — it can never invent a path."""
    from app.ai.provider import get_chat_provider

    progress = {
        p["key"]: len(await _completed_steps(session, learner, p["key"]) & {s["key"] for s in p["steps"]})
        for p in PATHS
    }

    recent_questions = [
        row[0]
        for row in (
            await session.execute(
                select(Message.content)
                .join(Conversation)
                .where(Conversation.learner_id == learner.id, Message.role == "user")
                .order_by(Message.id.desc())
                .limit(10)
            )
        ).all()
    ]

    def rules() -> schemas.RecommendOut:
        return schemas.RecommendOut(
            source="rules",
            suggestions=[
                schemas.RecommendSuggestionOut(
                    path_key=s["path_key"],
                    title=PATHS_BY_KEY[s["path_key"]]["title"],
                    description=PATHS_BY_KEY[s["path_key"]]["description"],
                    reason=s["reason"],
                )
                for s in _rules_suggestions(learner, progress)
            ],
        )

    chat = get_chat_provider()
    if not chat.available or not recent_questions:
        return rules()  # nothing personal to reason over, or AI down — rules cover it

    catalog = "\n".join(
        f"- {p['key']}: {p['title']} — {p['description']} "
        f"[{progress[p['key']]}/{len(p['steps'])} studied]"
        for p in PATHS
    )
    try:
        result = await chat.structured(
            model=chat.classifier_model,
            schema=_RECOMMEND_SCHEMA,
            system=(
                "You recommend what a learner should study next in an Islamic learning app.\n"
                "Pick up to 3 paths from the catalog ONLY (use exact path_key values). "
                "Ground every reason in the learner's own recent questions or progress, in one "
                "warm plain sentence. Prefer unfinished or unstarted paths over completed ones.\n"
                "If their questions point to a topic no path covers, set explore_query to a short "
                "search phrase for it; else null."
            ),
            user=(
                f"Catalog:\n{catalog}\n\n"
                f"Learner persona: {learner.persona or 'unspecified'}\n"
                f"Recent questions (newest first):\n"
                + "\n".join(f"- {q[:200]}" for q in recent_questions)
            ),
            max_tokens=800,
        )
        suggestions = [
            schemas.RecommendSuggestionOut(
                path_key=s["path_key"],
                title=PATHS_BY_KEY[s["path_key"]]["title"],
                description=PATHS_BY_KEY[s["path_key"]]["description"],
                reason=str(s.get("reason", ""))[:300],
            )
            for s in result.get("suggestions", [])
            if s.get("path_key") in PATHS_BY_KEY  # catalog-validated: AI cannot invent paths
        ][:3]
        if not suggestions:
            return rules()
        explore = result.get("explore_query")
        return schemas.RecommendOut(
            source="ai",
            suggestions=suggestions,
            explore_query=str(explore)[:100] if explore else None,
        )
    except Exception:  # noqa: BLE001 — recommendations must never 500; rules always work
        log.warning("AI recommend failed; serving rules fallback", exc_info=True)
        return rules()
