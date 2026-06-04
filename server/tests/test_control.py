from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_control_event_requires_auth(client: AsyncClient):
    resp = await client.post("/control/events", json={"action": "click", "summary": "x"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_control_event_blocked_when_disabled(client: AsyncClient, admin_token: str, user_token: str):
    h_admin = {"Authorization": f"Bearer {admin_token}"}
    h_user = {"Authorization": f"Bearer {user_token}"}
    # Default: computer_control disabled
    await client.patch(
        "/tenant/settings",
        json={"computer_control_enabled": False},
        headers=h_admin,
    )
    resp = await client.post(
        "/control/events",
        json={"action": "click", "summary": "Click submit"},
        headers=h_user,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_control_event_recorded_when_enabled(client: AsyncClient, admin_token: str, user_token: str):
    h_admin = {"Authorization": f"Bearer {admin_token}"}
    h_user = {"Authorization": f"Bearer {user_token}"}
    enable = await client.patch(
        "/tenant/settings",
        json={"computer_control_enabled": True},
        headers=h_admin,
    )
    assert enable.status_code == 200

    rec = await client.post(
        "/control/events",
        json={
            "action": "click",
            "target": "submit-button",
            "summary": "Click the Submit button on the form",
            "approved": True,
        },
        headers=h_user,
    )
    assert rec.status_code == 201, rec.text

    # Verify it shows up in the audit log
    logs = await client.get(
        "/audit/logs", params={"action": "control_click"}, headers=h_admin
    )
    assert logs.status_code == 200
    items = logs.json()["logs"]
    assert any(entry["action"] == "control_click" for entry in items)


@pytest.mark.asyncio
async def test_public_settings_includes_dock_flag(client: AsyncClient):
    resp = await client.get("/tenant/public-settings")
    assert resp.status_code == 200
    assert "assistant_dock_enabled" in resp.json()
