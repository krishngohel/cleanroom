from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest_asyncio.fixture
async def workspace(client: AsyncClient, admin_token: str):
    """Create a temp dir + workspace pointing at it. Yields (workspace_dict, tmp_path)."""
    tmp = tempfile.mkdtemp(prefix="cleanroom_ws_")
    root = Path(tmp)
    (root / "hello.py").write_text("print('hi')\n", encoding="utf-8")
    (root / "data").mkdir()
    (root / "data" / "notes.md").write_text("# Notes\n", encoding="utf-8")
    (root / ".git").mkdir()
    (root / ".git" / "config").write_text("ignored", encoding="utf-8")

    resp = await client.post(
        "/code/workspaces",
        json={"name": "Test WS", "root_path": str(root)},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    yield resp.json(), root


@pytest.mark.asyncio
async def test_create_workspace_requires_admin(client: AsyncClient, user_token: str):
    resp = await client.post(
        "/code/workspaces",
        json={"name": "x", "root_path": tempfile.gettempdir()},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_workspace_rejects_missing_path(client: AsyncClient, admin_token: str):
    resp = await client.post(
        "/code/workspaces",
        json={"name": "x", "root_path": "/nope/does/not/exist/abcdef"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_tree_filters_hidden(client: AsyncClient, workspace, user_token: str):
    ws, _root = workspace
    resp = await client.get(
        f"/code/workspaces/{ws['id']}/tree",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 200
    paths = [e["path"] for e in resp.json()["entries"]]
    assert "hello.py" in paths
    assert "data/notes.md" in paths
    # .git dir + its contents must be filtered
    assert not any(p.startswith(".git") for p in paths)


@pytest.mark.asyncio
async def test_read_file(client: AsyncClient, workspace, user_token: str):
    ws, _root = workspace
    resp = await client.get(
        f"/code/workspaces/{ws['id']}/file",
        params={"path": "hello.py"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == "print('hi')\n"


@pytest.mark.asyncio
async def test_path_traversal_blocked(client: AsyncClient, workspace, user_token: str):
    ws, _root = workspace
    headers = {"Authorization": f"Bearer {user_token}"}
    # Try ../../etc/passwd-style escapes
    for bad in ("../outside.txt", "../../../etc/passwd", "..\\..\\windows\\system32"):
        resp = await client.get(
            f"/code/workspaces/{ws['id']}/file",
            params={"path": bad},
            headers=headers,
        )
        assert resp.status_code == 400, f"path {bad!r} should be blocked, got {resp.status_code}"


@pytest.mark.asyncio
async def test_write_file_and_readback(client: AsyncClient, workspace, user_token: str):
    ws, root = workspace
    headers = {"Authorization": f"Bearer {user_token}"}
    write = await client.put(
        f"/code/workspaces/{ws['id']}/file",
        json={"path": "new/file.txt", "content": "added"},
        headers=headers,
    )
    assert write.status_code == 200, write.text
    assert (root / "new" / "file.txt").read_text(encoding="utf-8") == "added"

    read = await client.get(
        f"/code/workspaces/{ws['id']}/file",
        params={"path": "new/file.txt"},
        headers=headers,
    )
    assert read.status_code == 200
    assert read.json()["content"] == "added"


@pytest.mark.asyncio
async def test_read_only_workspace_rejects_writes(
    client: AsyncClient, workspace, admin_token: str, user_token: str
):
    ws, _root = workspace
    # Admin locks the workspace
    patch = await client.patch(
        f"/code/workspaces/{ws['id']}",
        json={"is_writable": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert patch.status_code == 200
    write = await client.put(
        f"/code/workspaces/{ws['id']}/file",
        json={"path": "hello.py", "content": "nope"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert write.status_code == 403


@pytest.mark.asyncio
async def test_create_empty_file(client: AsyncClient, workspace, user_token: str):
    ws, root = workspace
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await client.put(
        f"/code/workspaces/{ws['id']}/file",
        json={"path": "draft/new-doc.md", "content": ""},
        headers=headers,
    )
    assert resp.status_code == 200
    assert (root / "draft" / "new-doc.md").exists()
    assert (root / "draft" / "new-doc.md").read_text(encoding="utf-8") == ""


@pytest.mark.asyncio
async def test_create_dir(client: AsyncClient, workspace, user_token: str):
    ws, root = workspace
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await client.post(
        f"/code/workspaces/{ws['id']}/dir",
        json={"path": "reports/2026"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert (root / "reports" / "2026").is_dir()

    # Second create — idempotent (already exists, no error)
    again = await client.post(
        f"/code/workspaces/{ws['id']}/dir",
        json={"path": "reports/2026"},
        headers=headers,
    )
    assert again.status_code == 201


@pytest.mark.asyncio
async def test_create_dir_path_traversal_blocked(
    client: AsyncClient, workspace, user_token: str
):
    ws, _root = workspace
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await client.post(
        f"/code/workspaces/{ws['id']}/dir",
        json={"path": "../escape"},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_dir_conflict_with_file(
    client: AsyncClient, workspace, user_token: str
):
    ws, _root = workspace
    headers = {"Authorization": f"Bearer {user_token}"}
    # hello.py already exists as a file from the fixture
    resp = await client.post(
        f"/code/workspaces/{ws['id']}/dir",
        json={"path": "hello.py"},
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_file(client: AsyncClient, workspace, user_token: str):
    ws, root = workspace
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await client.delete(
        f"/code/workspaces/{ws['id']}/file",
        params={"path": "data/notes.md"},
        headers=headers,
    )
    assert resp.status_code == 204
    assert not (root / "data" / "notes.md").exists()
