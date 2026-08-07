"""In-app admin panel API: content management and user support.

Access is a role on the account (users.is_admin), not a shared token — the
admin signs in like anyone else and the httpOnly session cookie carries the
permission. Everything here is invisible to non-admin accounts (403).
"""

import asyncio
import logging
import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import get_embedder
from app.api import schemas
from app.api.auth_routes import current_user
from app.db.engine import get_session
from app.db.models import (
    AskLog,
    ContentNote,
    Conversation,
    HadithCollection,
    HadithRecord,
    HadithRevision,
    Learner,
    QuranTranslation,
    QuranVerse,
    SavedItem,
    User,
)
from app.retrieval.arabic import normalize_arabic

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin")

_QURAN_REF = re.compile(r"^(\d{1,3})\s*:\s*(\d{1,3})$")
_HADITH_REF = re.compile(r"^([a-z]+)\s+(\S+)$")


async def require_admin(
    user: User | None = Depends(current_user),
) -> User:
    if user is None:
        raise HTTPException(401, "Not signed in.")
    if not user.is_admin:
        raise HTTPException(403, "This account does not have admin access.")
    return user


# --- overview ----------------------------------------------------------------


@router.get("/overview", response_model=schemas.AdminStatsOut, dependencies=[Depends(require_admin)])
async def overview(session: AsyncSession = Depends(get_session)):
    async def count(stmt) -> int:
        return (await session.execute(stmt)).scalar() or 0

    by_category_rows = (
        await session.execute(select(AskLog.category, func.count()).group_by(AskLog.category))
    ).all()
    avg_latency = (
        await session.execute(select(func.avg(AskLog.latency_ms)).where(AskLog.status == "ok"))
    ).scalar()

    # 14-day activity series for the dashboard chart, gaps zero-filled
    since = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=13)
    day_col = func.date_trunc("day", AskLog.created_at)
    day_rows = (
        await session.execute(
            select(
                day_col,
                func.count(),
                func.count().filter(AskLog.status == "error"),
            )
            .where(AskLog.created_at >= since)
            .group_by(day_col)
        )
    ).all()
    by_day = {d.date().isoformat(): (n, e) for d, n, e in day_rows}
    asks_by_day = []
    for i in range(14):
        key = (since + timedelta(days=i)).date().isoformat()
        n, e = by_day.get(key, (0, 0))
        asks_by_day.append(schemas.AskDayOut(day=key, count=n, errors=e))

    new_users_7d = (
        await session.execute(
            select(func.count()).where(User.created_at >= datetime.now(UTC) - timedelta(days=7))
        )
    ).scalar() or 0

    return schemas.AdminStatsOut(
        verses=await count(select(func.count()).select_from(QuranVerse)),
        hadiths=await count(select(func.count()).select_from(HadithRecord)),
        quran_embeddings=await count(
            select(func.count()).where(QuranTranslation.embedding.is_not(None))
        ),
        hadith_embeddings=await count(
            select(func.count()).where(HadithRecord.embedding.is_not(None))
        ),
        asks_total=await count(select(func.count()).select_from(AskLog)),
        asks_by_category={str(c or "error"): n for c, n in by_category_rows},
        asks_errored=await count(select(func.count()).where(AskLog.status == "error")),
        avg_latency_ms=float(avg_latency) if avg_latency is not None else None,
        users=await count(select(func.count()).select_from(User)),
        notes=await count(select(func.count()).select_from(ContentNote)),
        asks_by_day=asks_by_day,
        new_users_7d=new_users_7d,
    )


@router.get("/asks", response_model=schemas.AskLogListOut, dependencies=[Depends(require_admin)])
async def asks(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    total = (await session.execute(select(func.count()).select_from(AskLog))).scalar() or 0
    rows = (
        (
            await session.execute(
                select(AskLog).order_by(AskLog.created_at.desc()).offset(offset).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return schemas.AskLogListOut(
        total=total,
        items=[
            schemas.AskLogOut(
                id=r.id,
                created_at=r.created_at.isoformat(),
                question=r.question,
                category=r.category,
                answer=r.answer,
                provider=r.provider,
                model=r.model,
                latency_ms=r.latency_ms,
                status=r.status,
                error=r.error,
            )
            for r in rows
        ],
    )


# --- users (support view) -----------------------------------------------------


@router.get("/users", response_model=list[schemas.AdminUserOut], dependencies=[Depends(require_admin)])
async def users(session: AsyncSession = Depends(get_session)):
    conv_counts = dict(
        (
            await session.execute(
                select(Learner.user_id, func.count(Conversation.id))
                .join(Conversation, Conversation.learner_id == Learner.id)
                .where(Learner.user_id.is_not(None))
                .group_by(Learner.user_id)
            )
        ).all()
    )
    saved_counts = dict(
        (
            await session.execute(
                select(Learner.user_id, func.count(SavedItem.id))
                .join(SavedItem, SavedItem.learner_id == Learner.id)
                .where(Learner.user_id.is_not(None))
                .group_by(Learner.user_id)
            )
        ).all()
    )
    rows = (
        (await session.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    )
    return [
        schemas.AdminUserOut(
            id=u.id,
            email=u.email,
            created_at=u.created_at.isoformat(),
            is_admin=u.is_admin,
            conversations=conv_counts.get(u.id, 0),
            saved=saved_counts.get(u.id, 0),
        )
        for u in rows
    ]


# --- notes pinned to references ------------------------------------------------


async def _validate_reference(session: AsyncSession, kind: str, reference: str) -> str:
    """Normalize to canonical form and confirm the target exists."""
    ref = " ".join(reference.strip().lower().split())
    if kind == "quran":
        m = _QURAN_REF.match(ref)
        if not m:
            raise HTTPException(400, "Quran reference must look like 2:255.")
        ref = f"{int(m.group(1))}:{int(m.group(2))}"
        exists = (
            await session.execute(
                select(QuranVerse.id).where(
                    QuranVerse.surah_number == int(m.group(1)),
                    QuranVerse.ayah_number == int(m.group(2)),
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(404, f"Verse {ref} does not exist.")
        return ref
    m = _HADITH_REF.match(ref)
    if not m:
        raise HTTPException(400, "Hadith reference must look like: bukhari 6018.")
    exists = (
        await session.execute(
            select(HadithRecord.id)
            .join(HadithCollection, HadithRecord.collection_id == HadithCollection.id)
            .where(
                HadithCollection.key == m.group(1),
                HadithRecord.hadith_number == m.group(2),
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(404, f"No hadith found for '{ref}'.")
    return ref


def _note_out(n: ContentNote) -> schemas.NoteOut:
    return schemas.NoteOut(
        id=n.id,
        kind=n.kind,
        reference=n.reference,
        body=n.body,
        created_at=n.created_at.isoformat(),
        updated_at=n.updated_at.isoformat(),
    )


@router.get("/notes", response_model=list[schemas.NoteOut], dependencies=[Depends(require_admin)])
async def list_notes(session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(ContentNote).order_by(ContentNote.updated_at.desc()).limit(200)
            )
        )
        .scalars()
        .all()
    )
    return [_note_out(n) for n in rows]


@router.post("/notes", response_model=schemas.NoteOut)
async def create_note(
    body: schemas.NoteIn,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "The note text is empty.")
    ref = await _validate_reference(session, body.kind, body.reference)
    note = ContentNote(kind=body.kind, reference=ref, body=text, created_by=admin.id)
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return _note_out(note)


@router.patch("/notes/{note_id}", response_model=schemas.NoteOut, dependencies=[Depends(require_admin)])
async def update_note(
    note_id: int,
    body: schemas.NotePatch,
    session: AsyncSession = Depends(get_session),
):
    note = (
        await session.execute(select(ContentNote).where(ContentNote.id == note_id))
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(404, "Note not found.")
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "The note text is empty.")
    note.body = text
    note.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(note)
    return _note_out(note)


@router.delete("/notes/{note_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_note(note_id: int, session: AsyncSession = Depends(get_session)):
    note = (
        await session.execute(select(ContentNote).where(ContentNote.id == note_id))
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(404, "Note not found.")
    await session.delete(note)
    await session.commit()


# --- hadith entries (add and correct) -------------------------------------------


def _snapshot(r: HadithRecord) -> dict:
    """The editable fields, stored verbatim in every revision row."""
    return {
        "text_english": r.text_english,
        "text_arabic": r.text_arabic,
        "book_name": r.book_name,
        "gradings": r.gradings or [],
    }


async def _embed_record(record: HadithRecord) -> None:
    """Vector search should reflect admin content immediately, not at the next
    bulk embed run. Best-effort with a hard timeout: on failure the row stays
    keyword- and reference-searchable, which is how it worked before."""
    if not record.text_english:
        return
    embedder = get_embedder()
    if not embedder.available:
        return
    try:
        vectors = await asyncio.wait_for(
            embedder.embed([record.text_english[:12000]], "document"), timeout=20
        )
        record.embedding = vectors[0]
        record.embedding_model = embedder.model
    except Exception:  # noqa: BLE001 — embedding is enhancement, never a blocker
        log.warning("admin hadith embed failed; row stays lexical-only", exc_info=True)


def _hadith_out(r: HadithRecord, collection: HadithCollection) -> schemas.AdminHadithOut:
    grade = None
    if r.gradings:
        grade = r.gradings[0].get("grade")
    return schemas.AdminHadithOut(
        id=r.id,
        collection_key=collection.key,
        collection_name=collection.name_english,
        hadith_number=r.hadith_number,
        book_name=r.book_name,
        text_english=r.text_english,
        text_arabic=r.text_arabic,
        grade=grade,
    )


@router.get(
    "/hadith/collections",
    response_model=list[schemas.AdminCollectionOut],
    dependencies=[Depends(require_admin)],
)
async def collections(session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(
            select(HadithCollection, func.count(HadithRecord.id))
            .outerjoin(HadithRecord, HadithRecord.collection_id == HadithCollection.id)
            .group_by(HadithCollection.id)
            .order_by(HadithCollection.id)
        )
    ).all()
    return [
        schemas.AdminCollectionOut(key=c.key, name=c.name_english, count=n) for c, n in rows
    ]


@router.get(
    "/hadith/find",
    response_model=list[schemas.AdminHadithOut],
    dependencies=[Depends(require_admin)],
)
async def find_hadith(
    q: str = Query(..., min_length=1, max_length=200),
    collection: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(HadithRecord, HadithCollection)
        .join(HadithCollection, HadithRecord.collection_id == HadithCollection.id)
        .limit(20)
    )
    if collection:
        stmt = stmt.where(HadithCollection.key == collection)
    q = q.strip()
    # A single token might be a hadith number of any shape ("2564a", "wtest1"):
    # try the exact number first, then fall back to text search.
    if re.fullmatch(r"\S+", q):
        rows = (
            await session.execute(stmt.where(HadithRecord.hadith_number == q.lower()))
        ).all()
        if rows:
            return [_hadith_out(r, c) for r, c in rows]
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = (
        await session.execute(
            stmt.where(HadithRecord.text_english.ilike(f"%{escaped}%", escape="\\"))
        )
    ).all()
    return [_hadith_out(r, c) for r, c in rows]


@router.post("/hadith", response_model=schemas.AdminHadithOut)
async def add_hadith(
    body: schemas.AdminHadithIn,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    collection = (
        await session.execute(
            select(HadithCollection).where(HadithCollection.key == body.collection_key)
        )
    ).scalar_one_or_none()
    if collection is None:
        raise HTTPException(404, "Unknown collection.")
    number = body.hadith_number.strip().lower()
    if not number:
        raise HTTPException(400, "A hadith number is required.")
    if not body.text_english.strip():
        raise HTTPException(400, "The English text is empty.")
    duplicate = (
        await session.execute(
            select(HadithRecord.id).where(
                HadithRecord.collection_id == collection.id,
                HadithRecord.hadith_number == number,
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(409, f"{collection.name_english} {number} already exists. Edit it instead.")
    arabic = (body.text_arabic or "").strip() or None
    record = HadithRecord(
        collection_id=collection.id,
        hadith_number=number,
        book_name=(body.book_name or "").strip() or None,
        text_english=body.text_english.strip(),
        text_arabic=arabic,
        text_arabic_normalized=normalize_arabic(arabic) if arabic else None,
        gradings=[{"name": "Added by admin", "grade": body.grade.strip()}] if body.grade else [],
        reference_schemes={},
    )
    session.add(record)
    await session.flush()
    await _embed_record(record)  # searchable by meaning right away, not next embed run
    session.add(
        HadithRevision(
            record_id=record.id,
            changed_by=admin.id,
            action="add",
            reference=f"{collection.key} {number}",
            before=None,
            after=_snapshot(record),
        )
    )
    await session.commit()
    await session.refresh(record)
    return _hadith_out(record, collection)


@router.patch("/hadith/{record_id}", response_model=schemas.AdminHadithOut)
async def edit_hadith(
    record_id: int,
    body: schemas.AdminHadithPatch,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    row = (
        await session.execute(
            select(HadithRecord, HadithCollection)
            .join(HadithCollection, HadithRecord.collection_id == HadithCollection.id)
            .where(HadithRecord.id == record_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Hadith not found.")
    record, collection = row
    before = _snapshot(record)
    if body.text_english is not None:
        if not body.text_english.strip():
            raise HTTPException(400, "The English text is empty.")
        record.text_english = body.text_english.strip()
    if body.text_arabic is not None:
        arabic = body.text_arabic.strip() or None
        record.text_arabic = arabic
        record.text_arabic_normalized = normalize_arabic(arabic) if arabic else None
    if body.book_name is not None:
        record.book_name = body.book_name.strip() or None
    if body.grade is not None:
        record.gradings = (
            [{"name": "Corrected by admin", "grade": body.grade.strip()}] if body.grade.strip() else []
        )
    after = _snapshot(record)
    if after != before:
        if after["text_english"] != before["text_english"]:
            # vector search must reflect the corrected text, not the old wording
            record.embedding = None
            await _embed_record(record)
        session.add(
            HadithRevision(
                record_id=record.id,
                changed_by=admin.id,
                action="edit",
                reference=f"{collection.key} {record.hadith_number}",
                before=before,
                after=after,
            )
        )
    await session.commit()
    await session.refresh(record)
    return _hadith_out(record, collection)


@router.delete("/hadith/{record_id}", status_code=204)
async def delete_hadith(
    record_id: int,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    row = (
        await session.execute(
            select(HadithRecord, HadithCollection)
            .join(HadithCollection, HadithRecord.collection_id == HadithCollection.id)
            .where(HadithRecord.id == record_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Hadith not found.")
    record, collection = row
    # Canonical corpus rows are never deletable; only entries an admin added.
    was_added = (
        await session.execute(
            select(HadithRevision.id).where(
                HadithRevision.record_id == record_id, HadithRevision.action == "add"
            )
        )
    ).first()
    if was_added is None:
        raise HTTPException(
            400, "Only admin-added entries can be deleted. Correct the text instead."
        )
    session.add(
        HadithRevision(
            record_id=None,  # the record is going away; the snapshot preserves it
            changed_by=admin.id,
            action="delete",
            reference=f"{collection.key} {record.hadith_number}",
            before=_snapshot(record),
            after=None,
        )
    )
    await session.delete(record)
    await session.commit()


@router.get(
    "/hadith/revisions",
    response_model=list[schemas.HadithRevisionOut],
    dependencies=[Depends(require_admin)],
)
async def hadith_revisions(
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    """Every admin change to hadith content, newest first: the review trail."""
    rows = (
        await session.execute(
            select(HadithRevision, User.email)
            .join(User, User.id == HadithRevision.changed_by)
            .order_by(HadithRevision.changed_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        schemas.HadithRevisionOut(
            id=r.id,
            record_id=r.record_id,
            action=r.action,
            reference=r.reference,
            changed_by_email=email,
            changed_at=r.changed_at.isoformat(),
            before=r.before,
            after=r.after,
        )
        for r, email in rows
    ]
