"""Remove wf-test artifacts created by the automated audit: accounts named
wf-test-*@example.com (with their learners and data), wtest* hadith entries,
and [wf-test] content notes. Real user data is untouched."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select

from app.db.engine import get_sessionmaker
from app.db.models import (
    AuthToken,
    ContentNote,
    Conversation,
    HadithRecord,
    Learner,
    Message,
    PasswordReset,
    PathProgress,
    SavedItem,
    User,
)


async def main() -> None:
    async with get_sessionmaker()() as s:
        users = (
            (await s.execute(select(User).where(User.email.like("wf-test-%")))).scalars().all()
        )
        user_ids = [u.id for u in users]
        learner_ids = []
        if user_ids:
            learner_ids = [
                r
                for r in (
                    await s.execute(select(Learner.id).where(Learner.user_id.in_(user_ids)))
                ).scalars()
            ]
        if learner_ids:
            conv_ids = [
                r
                for r in (
                    await s.execute(
                        select(Conversation.id).where(Conversation.learner_id.in_(learner_ids))
                    )
                ).scalars()
            ]
            if conv_ids:
                await s.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
                await s.execute(delete(Conversation).where(Conversation.id.in_(conv_ids)))
            await s.execute(delete(SavedItem).where(SavedItem.learner_id.in_(learner_ids)))
            await s.execute(delete(PathProgress).where(PathProgress.learner_id.in_(learner_ids)))
            await s.execute(delete(Learner).where(Learner.id.in_(learner_ids)))
        if user_ids:
            await s.execute(delete(AuthToken).where(AuthToken.user_id.in_(user_ids)))
            await s.execute(delete(PasswordReset).where(PasswordReset.user_id.in_(user_ids)))
            await s.execute(delete(User).where(User.id.in_(user_ids)))

        hadith = await s.execute(
            delete(HadithRecord).where(HadithRecord.hadith_number.like("wtest%"))
        )
        notes = await s.execute(delete(ContentNote).where(ContentNote.body.like("[wf-test]%")))
        await s.commit()
        print(
            f"removed {len(user_ids)} wf-test accounts, {len(learner_ids)} learners, "
            f"{hadith.rowcount} test hadith, {notes.rowcount} test notes"
        )


asyncio.run(main())
