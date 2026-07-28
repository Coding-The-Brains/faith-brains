"""Optional accounts on top of anonymous learners.

Register/login claims the device's anonymous learner for the account; logging
in on a second device merges that device's data into the account's primary
learner. Passwords: stdlib scrypt. Sessions: opaque expiring tokens in
auth_tokens, delivered as an httpOnly cookie so page scripts can never read
them (the frontend proxies /api/v1 same-origin, so the cookie just works).
"""

import hashlib
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import schemas
from app.api.learner_routes import get_learner
from app.api.ratelimit import limit_auth
from app.db.engine import get_session
from app.db.models import AuthToken, Conversation, Learner, PathProgress, SavedItem, User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_COOKIE = "fb_token"
_TOKEN_TTL = timedelta(days=30)


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return secrets.compare_digest(digest.hex(), digest_hex)
    except Exception:  # noqa: BLE001 — malformed hash must read as wrong password
        return False


def token_from_request(
    fb_token: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> str | None:
    """Cookie first (the normal path); Authorization: Bearer kept for API clients."""
    if fb_token:
        return fb_token
    if authorization and authorization.startswith("Bearer "):
        return authorization.removeprefix("Bearer ").strip() or None
    return None


async def current_user(
    token: str | None = Depends(token_from_request),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    if not token:
        return None
    return (
        await session.execute(
            select(User)
            .join(AuthToken, AuthToken.user_id == User.id)
            .where(AuthToken.token == token, AuthToken.expires_at > datetime.now(UTC))
        )
    ).scalar_one_or_none()


async def _primary_learner(session: AsyncSession, user: User) -> Learner | None:
    return (
        await session.execute(
            select(Learner).where(Learner.user_id == user.id).order_by(Learner.created_at).limit(1)
        )
    ).scalar_one_or_none()


async def _merge_learners(session: AsyncSession, source: Learner, target: Learner) -> None:
    """Move a device's anonymous data into the account's primary learner."""
    if source.id == target.id:
        return
    existing = {
        (r.kind, r.reference)
        for r in (
            await session.execute(select(SavedItem).where(SavedItem.learner_id == target.id))
        ).scalars()
    }
    for item in (
        await session.execute(select(SavedItem).where(SavedItem.learner_id == source.id))
    ).scalars():
        if (item.kind, item.reference) in existing:
            await session.delete(item)
        else:
            item.learner_id = target.id
    done = {
        (r.path_key, r.step_key)
        for r in (
            await session.execute(select(PathProgress).where(PathProgress.learner_id == target.id))
        ).scalars()
    }
    for row in (
        await session.execute(select(PathProgress).where(PathProgress.learner_id == source.id))
    ).scalars():
        if (row.path_key, row.step_key) in done:
            await session.delete(row)
        else:
            row.learner_id = target.id
    await session.execute(
        update(Conversation).where(Conversation.learner_id == source.id).values(learner_id=target.id)
    )
    if target.persona is None and source.persona is not None:
        target.persona = source.persona
    source.user_id = target.user_id


async def _start_session(session: AsyncSession, user: User, response: Response) -> None:
    """Issue a fresh expiring token and hand it to the browser as httpOnly."""
    # opportunistic cleanup so dead tokens do not pile up
    await session.execute(
        delete(AuthToken).where(AuthToken.user_id == user.id, AuthToken.expires_at <= datetime.now(UTC))
    )
    token = secrets.token_urlsafe(32)
    session.add(AuthToken(token=token, user_id=user.id, expires_at=datetime.now(UTC) + _TOKEN_TTL))
    await session.commit()
    response.set_cookie(
        key=TOKEN_COOKIE,
        value=token,
        max_age=int(_TOKEN_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        path="/",
        # ponytail: secure=False because the beta serves plain http; set True at https rollout
    )


@router.post("/register", response_model=schemas.MeOut, dependencies=[Depends(limit_auth)])
async def register(
    body: schemas.AuthIn,
    response: Response,
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    email = body.email.strip().lower()
    if not _EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "Enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    exists = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    user = User(email=email, password_hash=_hash_password(body.password))
    session.add(user)
    await session.flush()
    if learner.user_id is None:
        learner.user_id = user.id  # this device's data becomes the account's data
    await _start_session(session, user, response)
    return schemas.MeOut(email=email)


@router.post("/login", response_model=schemas.MeOut, dependencies=[Depends(limit_auth)])
async def login(
    body: schemas.AuthIn,
    response: Response,
    learner: Learner = Depends(get_learner),
    session: AsyncSession = Depends(get_session),
):
    email = body.email.strip().lower()
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None or not _verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password.")
    primary = await _primary_learner(session, user)
    if primary is None:
        if learner.user_id is None:
            learner.user_id = user.id
    elif learner.user_id is None:
        await _merge_learners(session, learner, primary)
    await _start_session(session, user, response)
    return schemas.MeOut(email=email)


@router.post("/logout", status_code=204, dependencies=[Depends(limit_auth)])
async def logout(
    response: Response,
    token: str | None = Depends(token_from_request),
    session: AsyncSession = Depends(get_session),
):
    if token:
        await session.execute(delete(AuthToken).where(AuthToken.token == token))
        await session.commit()
    response.delete_cookie(TOKEN_COOKIE, path="/")


@router.post("/logout-all", status_code=204, dependencies=[Depends(limit_auth)])
async def logout_all(
    response: Response,
    user: User | None = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Sign out on every device by revoking all of the account's tokens."""
    if user is not None:
        await session.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
        await session.commit()
    response.delete_cookie(TOKEN_COOKIE, path="/")


@router.get("/me", response_model=schemas.MeOut)
async def me(user: User | None = Depends(current_user)):
    if user is None:
        raise HTTPException(401, "Not signed in.")
    return schemas.MeOut(email=user.email)
