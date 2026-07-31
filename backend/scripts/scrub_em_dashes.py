import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(".").resolve()))
from sqlalchemy import text

from app.db.engine import get_sessionmaker

SQL = [
    (
        "semantic_cache",
        """UPDATE semantic_cache SET payload = jsonb_set(payload, '{answer}',
        to_jsonb(regexp_replace(payload->>'answer', '\\s*\u2014\\s*', ', ', 'g')))
        WHERE payload->>'answer' LIKE '%\u2014%'""",
    ),
    (
        "messages",
        """UPDATE messages SET content = regexp_replace(content, '\\s*\u2014\\s*', ', ', 'g')
        WHERE role = 'assistant' AND content LIKE '%\u2014%'""",
    ),
    (
        "ask_logs",
        """UPDATE ask_logs SET answer = regexp_replace(answer, '\\s*\u2014\\s*', ', ', 'g')
        WHERE answer LIKE '%\u2014%'""",
    ),
    (
        "editions",
        """UPDATE editions SET license_name = regexp_replace(license_name, '\\s*\u2014\\s*', ', ', 'g')
        WHERE license_name LIKE '%\u2014%'""",
    ),
]


async def main():
    async with get_sessionmaker()() as s:
        for name, sql in SQL:
            r = await s.execute(text(sql))
            print(f"{name}: {r.rowcount} rows scrubbed")
        await s.commit()


asyncio.run(main())
