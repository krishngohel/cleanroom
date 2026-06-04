from __future__ import annotations

import io

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_projects_require_auth(client: AsyncClient):
    resp = await client.get("/projects")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_and_list_project(client: AsyncClient, user_token: str):
    headers = {"Authorization": f"Bearer {user_token}"}
    create = await client.post(
        "/projects",
        json={"name": "Q4 Earnings", "description": "Earnings analysis", "system_prompt": "Be terse."},
        headers=headers,
    )
    assert create.status_code == 201, create.text
    pid = create.json()["id"]

    listing = await client.get("/projects", headers=headers)
    assert listing.status_code == 200
    names = [p["name"] for p in listing.json()]
    assert "Q4 Earnings" in names

    one = await client.get(f"/projects/{pid}", headers=headers)
    assert one.status_code == 200
    assert one.json()["system_prompt"] == "Be terse."
    assert one.json()["file_count"] == 0


@pytest.mark.asyncio
async def test_update_project_owner_only(client: AsyncClient, user_token: str, admin_token: str):
    headers_u = {"Authorization": f"Bearer {user_token}"}
    headers_a = {"Authorization": f"Bearer {admin_token}"}

    # Admin creates a non-shared project
    create = await client.post(
        "/projects",
        json={"name": "Admin Private", "is_shared": False},
        headers=headers_a,
    )
    assert create.status_code == 201
    pid = create.json()["id"]

    # Regular user can't see it
    get_user = await client.get(f"/projects/{pid}", headers=headers_u)
    assert get_user.status_code == 403

    # User can't update it either
    upd_user = await client.patch(f"/projects/{pid}", json={"name": "Hijack"}, headers=headers_u)
    assert upd_user.status_code == 403

    # Owner (admin) can
    upd_owner = await client.patch(
        f"/projects/{pid}", json={"description": "private notes"}, headers=headers_a
    )
    assert upd_owner.status_code == 200
    assert upd_owner.json()["description"] == "private notes"


@pytest.mark.asyncio
async def test_upload_and_delete_file(client: AsyncClient, user_token: str):
    headers = {"Authorization": f"Bearer {user_token}"}
    create = await client.post("/projects", json={"name": "Notes"}, headers=headers)
    pid = create.json()["id"]

    upload = await client.post(
        f"/projects/{pid}/files",
        files={"file": ("data.csv", io.BytesIO(b"a,b,c\n1,2,3\n"), "text/csv")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text
    fid = upload.json()["id"]
    assert upload.json()["size_bytes"] == len(b"a,b,c\n1,2,3\n")

    fetched = await client.get(f"/projects/{pid}", headers=headers)
    assert fetched.json()["file_count"] == 1

    deleted = await client.delete(f"/projects/{pid}/files/{fid}", headers=headers)
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_upload_rejects_non_utf8(client: AsyncClient, user_token: str):
    headers = {"Authorization": f"Bearer {user_token}"}
    create = await client.post("/projects", json={"name": "Bin"}, headers=headers)
    pid = create.json()["id"]
    bad = await client.post(
        f"/projects/{pid}/files",
        files={"file": ("bad.bin", io.BytesIO(b"\xff\xfe\x00\x00"), "application/octet-stream")},
        headers=headers,
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_delete_project_cascades_files(client: AsyncClient, user_token: str):
    headers = {"Authorization": f"Bearer {user_token}"}
    create = await client.post("/projects", json={"name": "Cascade"}, headers=headers)
    pid = create.json()["id"]
    upload = await client.post(
        f"/projects/{pid}/files",
        files={"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")},
        headers=headers,
    )
    assert upload.status_code == 201
    assert (await client.delete(f"/projects/{pid}", headers=headers)).status_code == 204
    # File should no longer be reachable
    assert (await client.get(f"/projects/{pid}", headers=headers)).status_code == 404
