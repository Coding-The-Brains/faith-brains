"""Rate limiting, keyed by client IP.

Counters live in the `rate_counters` table (one upsert per request), so limits
hold across restarts and are shared by every worker. Fixed one-minute windows —
simpler than sliding, worst case a short burst at a window boundary. If the DB
errors, the in-memory sliding-window limiter takes over (fail-open to the old
single-process behavior rather than blocking users).
"""

import logging
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from sqlalchemy import text

from app.db.engine import get_sessionmaker

log = logging.getLogger(__name__)

_UPSERT = text(
    """
    INSERT INTO rate_counters (key, window_start, count)
    VALUES (:key, date_trunc('minute', now()), 1)
    ON CONFLICT (key) DO UPDATE SET
        count = CASE
            WHEN rate_counters.window_start = date_trunc('minute', now())
            THEN rate_counters.count + 1 ELSE 1 END,
        window_start = date_trunc('minute', now())
    RETURNING count,
        60 - EXTRACT(EPOCH FROM (now() - date_trunc('minute', now())))::int AS retry_after
    """
)


class SlidingWindowLimiter:
    """In-memory fallback (and test seam): per-process sliding window."""

    def __init__(self, limit: int, window_seconds: float = 60.0):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def reset(self) -> None:
        self._hits.clear()

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            retry_after = max(1, int(hits[0] + self.window - now) + 1)
            _reject(retry_after)
        hits.append(now)


def _reject(retry_after: int) -> None:
    raise HTTPException(
        429,
        "Too many requests. Please slow down.",
        headers={"Retry-After": str(max(1, retry_after))},
    )


class DbLimiter:
    def __init__(self, scope: str, limit: int):
        self.scope = scope
        self.limit = limit
        self.fallback = SlidingWindowLimiter(limit)

    def reset(self) -> None:  # test seam parity with the old limiter
        self.fallback.reset()

    async def check(self, key: str) -> None:
        try:
            async with get_sessionmaker()() as s:
                row = (await s.execute(_UPSERT, {"key": f"{self.scope}:{key}"})).first()
                await s.commit()
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001 — DB down must not take the API with it
            log.warning("db rate limiter unavailable; using in-memory fallback", exc_info=True)
            self.fallback.check(key)
            return
        if row is not None and row.count > self.limit:
            _reject(int(row.retry_after))


ask_limiter = DbLimiter("ask", limit=15)  # AI generation is the expensive path
search_limiter = DbLimiter("search", limit=60)
transcribe_limiter = DbLimiter("transcribe", limit=10)  # audio upload + STT call
auth_limiter = DbLimiter("auth", limit=10)  # register/login attempts


def _client_key(request: Request) -> str:
    # Behind a proxy, trust the first X-Forwarded-For hop; else the socket peer.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def limit_ask(request: Request) -> None:
    await ask_limiter.check(_client_key(request))


async def limit_search(request: Request) -> None:
    await search_limiter.check(_client_key(request))


async def limit_transcribe(request: Request) -> None:
    await transcribe_limiter.check(_client_key(request))


async def limit_auth(request: Request) -> None:
    await auth_limiter.check(_client_key(request))
