"""Grant (or revoke) admin on an account: uv run python scripts/make_admin.py email [--revoke]"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db.engine import get_sessionmaker
from app.db.models import User


async def main() -> None:
    email = sys.argv[1].strip().lower()
    grant = "--revoke" not in sys.argv
    async with get_sessionmaker()() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            print(f"no account for {email}")
            return
        user.is_admin = grant
        await session.commit()
        print(f"{email}: is_admin={grant}")


if __name__ == "__main__":
    asyncio.run(main())
