"""Admin panel: role-gated access, ask logging, notes, hadith management,
rate limiting, security headers."""

import uuid

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.ai.answer import AnswerService
from app.ai.claude import ClaudeChat
from app.api import routes
from app.api.ratelimit import search_limiter
from app.db.models import User

pytestmark = pytest.mark.integration


class FakeChat(ClaudeChat):
    def __init__(self):
        super().__init__(api_key="fake-key")

    async def structured(self, **kwargs) -> dict:
        return {"category": "educational", "reason": "test"}

    async def text(self, **kwargs) -> str:
        return "Logged answer [1]."


async def _sign_in_admin(client, test_engine, email: str) -> None:
    """Register an account then flip its role, as scripts/make_admin.py would."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
        headers={"X-Session-Id": str(uuid.uuid4())},
    )
    assert resp.status_code == 200
    sessionmaker = async_sessionmaker(test_engine, expire_on_commit=False)
    async with sessionmaker() as session:
        await session.execute(update(User).where(User.email == email).values(is_admin=True))
        await session.commit()


async def test_admin_requires_admin_role(client, test_engine):
    assert (await client.get("/api/v1/admin/overview")).status_code == 401

    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "plain@example.com", "password": "password123"},
        headers={"X-Session-Id": str(uuid.uuid4())},
    )
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is False
    assert (await client.get("/api/v1/admin/overview")).status_code == 403

    sessionmaker = async_sessionmaker(test_engine, expire_on_commit=False)
    async with sessionmaker() as session:
        await session.execute(
            update(User).where(User.email == "plain@example.com").values(is_admin=True)
        )
        await session.commit()
    resp = await client.get("/api/v1/admin/overview")
    assert resp.status_code == 200
    body = resp.json()
    assert body["verses"] == 4 and body["hadiths"] == 1
    assert body["users"] >= 1


async def test_ask_is_logged_and_visible_in_admin(client, test_engine, monkeypatch):
    monkeypatch.setattr(
        routes, "answer_service", AnswerService(chat=FakeChat(), search=routes.search_service)
    )
    resp = await client.post(
        "/api/v1/ask", json={"question": "What does the Quran say about drowsiness and sleep?"}
    )
    assert resp.status_code == 200

    await _sign_in_admin(client, test_engine, "asklog-admin@example.com")
    logs = await client.get("/api/v1/admin/asks")
    assert logs.status_code == 200
    body = logs.json()
    assert body["total"] >= 1
    latest = body["items"][0]
    assert "drowsiness" in latest["question"]
    assert latest["category"] == "educational"
    assert latest["status"] == "ok"
    assert latest["latency_ms"] is not None


async def test_notes_crud(client, test_engine):
    await _sign_in_admin(client, test_engine, "notes-admin@example.com")

    bad = await client.post(
        "/api/v1/admin/notes",
        json={"kind": "quran", "reference": "not-a-ref", "body": "x"},
    )
    assert bad.status_code == 400
    missing = await client.post(
        "/api/v1/admin/notes",
        json={"kind": "quran", "reference": "99:99", "body": "x"},
    )
    assert missing.status_code == 404

    created = await client.post(
        "/api/v1/admin/notes",
        json={"kind": "quran", "reference": " 2 : 255 ", "body": "Recited for protection."},
    )
    assert created.status_code == 200
    note = created.json()
    assert note["reference"] == "2:255"  # normalized

    listed = await client.get("/api/v1/admin/notes")
    assert any(n["id"] == note["id"] for n in listed.json())

    patched = await client.patch(
        f"/api/v1/admin/notes/{note['id']}", json={"body": "Updated wording."}
    )
    assert patched.status_code == 200
    assert patched.json()["body"] == "Updated wording."

    assert (await client.delete(f"/api/v1/admin/notes/{note['id']}")).status_code == 204
    assert (await client.delete(f"/api/v1/admin/notes/{note['id']}")).status_code == 404


async def test_hadith_add_and_correct(client, test_engine):
    await _sign_in_admin(client, test_engine, "hadith-admin@example.com")

    added = await client.post(
        "/api/v1/admin/hadith",
        json={
            "collection_key": "bukhari",
            "hadith_number": "9999",
            "text_english": "Test narration about kindness.",
            "grade": "Sahih",
        },
    )
    assert added.status_code == 200
    record = added.json()
    assert record["grade"] == "Sahih"

    dup = await client.post(
        "/api/v1/admin/hadith",
        json={"collection_key": "bukhari", "hadith_number": "9999", "text_english": "x"},
    )
    assert dup.status_code == 409

    found = await client.get("/api/v1/admin/hadith/find?q=9999")
    assert found.status_code == 200
    assert any(h["id"] == record["id"] for h in found.json())

    fixed = await client.patch(
        f"/api/v1/admin/hadith/{record['id']}",
        json={"text_english": "Corrected narration about kindness."},
    )
    assert fixed.status_code == 200
    assert fixed.json()["text_english"].startswith("Corrected")


async def test_search_rate_limit(client, monkeypatch):
    monkeypatch.setattr(search_limiter, "limit", 3)
    search_limiter.reset()
    for _ in range(3):
        assert (await client.get("/api/v1/search?q=patience")).status_code == 200
    resp = await client.get("/api/v1/search?q=patience")
    assert resp.status_code == 429
    assert "retry-after" in {k.lower() for k in resp.headers.keys()}


async def test_security_headers(client):
    resp = await client.get("/api/v1/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
