from __future__ import annotations

import io

import pytest
from httpx import AsyncClient


# ── Prompts ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_prompts_require_auth(client: AsyncClient):
    assert (await client.get("/prompts")).status_code == 401


@pytest.mark.asyncio
async def test_create_list_use_prompt(client: AsyncClient, user_token: str):
    h = {"Authorization": f"Bearer {user_token}"}
    create = await client.post(
        "/prompts",
        json={
            "title": "Summarize",
            "body": "Summarize the above in 3 bullet points.",
            "slash": "summarize",
            "category": "writing",
        },
        headers=h,
    )
    assert create.status_code == 201, create.text
    pid = create.json()["id"]
    assert create.json()["slash"] == "summarize"

    listing = await client.get("/prompts", headers=h)
    assert any(p["id"] == pid for p in listing.json())

    used = await client.post(f"/prompts/{pid}/use", headers=h)
    assert used.status_code == 200
    assert used.json()["use_count"] == 1


@pytest.mark.asyncio
async def test_invalid_slash_rejected(client: AsyncClient, user_token: str):
    h = {"Authorization": f"Bearer {user_token}"}
    bad = await client.post(
        "/prompts",
        json={"title": "Bad", "body": "x", "slash": "Has Spaces!"},
        headers=h,
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_duplicate_slash_blocked(client: AsyncClient, user_token: str):
    h = {"Authorization": f"Bearer {user_token}"}
    a = await client.post("/prompts", json={"title": "A", "body": "a", "slash": "dup"}, headers=h)
    assert a.status_code == 201
    b = await client.post("/prompts", json={"title": "B", "body": "b", "slash": "dup"}, headers=h)
    assert b.status_code == 409


# ── Project search ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_project_search(client: AsyncClient, user_token: str):
    h = {"Authorization": f"Bearer {user_token}"}
    proj = await client.post("/projects", json={"name": "SearchMe"}, headers=h)
    pid = proj.json()["id"]
    await client.post(
        f"/projects/{pid}/files",
        files={"file": ("notes.md", io.BytesIO(b"# Q4 strategy\nFocus on enterprise tier.\nQ4 budget approved.\n"), "text/markdown")},
        headers=h,
    )
    await client.post(
        f"/projects/{pid}/files",
        files={"file": ("other.txt", io.BytesIO(b"Unrelated content."), "text/plain")},
        headers=h,
    )

    search = await client.get(f"/projects/{pid}/search", params={"q": "q4"}, headers=h)
    assert search.status_code == 200
    body = search.json()
    assert body["total_matches"] >= 2
    assert body["files"][0]["filename"] == "notes.md"
    assert any("Q4" in s["match"] or "q4" in s["match"].lower() for s in body["files"][0]["snippets"])


@pytest.mark.asyncio
async def test_search_rejects_short_query(client: AsyncClient, user_token: str):
    h = {"Authorization": f"Bearer {user_token}"}
    proj = await client.post("/projects", json={"name": "Short"}, headers=h)
    pid = proj.json()["id"]
    resp = await client.get(f"/projects/{pid}/search", params={"q": "a"}, headers=h)
    assert resp.status_code == 400


# ── Insights ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_insights_requires_admin(client: AsyncClient, user_token: str):
    resp = await client.get(
        "/insights/summary", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_insights_returns_shape(client: AsyncClient, admin_token: str):
    resp = await client.get(
        "/insights/summary?days=7",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "totals" in body
    assert "by_action" in body
    assert "top_users" in body
    assert "daily" in body
    assert body["totals"]["users"] >= 1
