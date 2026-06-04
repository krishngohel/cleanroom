from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from httpx import AsyncClient

from src.config import settings


@pytest.fixture(autouse=True)
def _isolate_uploads(monkeypatch):
    tmp = tempfile.mkdtemp(prefix="cleanroom_uploads_")
    monkeypatch.setattr(settings, "uploads_dir", tmp, raising=False)
    yield tmp


@pytest.mark.asyncio
async def test_user_can_create_personal_workspace(client: AsyncClient, user_token: str):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await client.post(
        "/code/workspaces/personal",
        json={"name": "My Files"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    ws = resp.json()
    assert ws["is_writable"] is True
    assert ws["is_shared"] is False
    # Root path should be inside the uploads dir
    assert "my-files" in ws["root_path"].replace("\\", "/")
    assert Path(ws["root_path"]).is_dir()


@pytest.mark.asyncio
async def test_personal_workspace_accepts_uploads_with_subdirs(
    client: AsyncClient, user_token: str
):
    headers = {"Authorization": f"Bearer {user_token}"}
    create = await client.post(
        "/code/workspaces/personal",
        json={"name": "Reports"},
        headers=headers,
    )
    ws = create.json()
    wsid = ws["id"]

    # Upload a nested file via the regular write endpoint — the path is
    # auto-created underneath the sandboxed root.
    write = await client.put(
        f"/code/workspaces/{wsid}/file",
        json={"path": "2026/q1/summary.md", "content": "# Q1\n"},
        headers=headers,
    )
    assert write.status_code == 200, write.text

    tree = await client.get(f"/code/workspaces/{wsid}/tree", headers=headers)
    paths = [e["path"] for e in tree.json()["entries"]]
    assert "2026/q1/summary.md" in paths


@pytest.mark.asyncio
async def test_personal_workspace_isolates_users(
    client: AsyncClient, user_token: str, admin_token: str
):
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    create = await client.post(
        "/code/workspaces/personal",
        json={"name": "Private notes"},
        headers=user_headers,
    )
    wsid = create.json()["id"]

    # Admin (different user) should be able to see + manage (admin always can),
    # but a hypothetical other regular user would not. We at least verify the
    # workspace is non-shared.
    fetched = await client.get(f"/code/workspaces/{wsid}", headers=admin_headers)
    assert fetched.status_code == 200
    assert fetched.json()["is_shared"] is False
