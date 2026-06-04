from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_public_settings_no_auth(client: AsyncClient):
    resp = await client.get("/tenant/public-settings")
    assert resp.status_code == 200
    body = resp.json()
    assert "brand_name" in body
    assert body["default_theme"] in ("light", "dark")
    # Compliance fields should NOT leak to unauthenticated endpoint
    assert "compliance_frameworks" not in body
    assert "dlp_patterns" not in body


@pytest.mark.asyncio
async def test_full_settings_requires_auth(client: AsyncClient):
    resp = await client.get("/tenant/settings")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_full_settings_authenticated(client: AsyncClient, user_token: str):
    resp = await client.get(
        "/tenant/settings", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["compliance_frameworks"], list)
    assert isinstance(body["dlp_patterns"], list)
    assert body["audit_retention_days"] >= 1


@pytest.mark.asyncio
async def test_patch_requires_admin(client: AsyncClient, user_token: str):
    resp = await client.patch(
        "/tenant/settings",
        json={"brand_name": "Hijack"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_patch_compliance(client: AsyncClient, admin_token: str):
    resp = await client.patch(
        "/tenant/settings",
        json={
            "brand_name": "Acme Cowork",
            "compliance_frameworks": ["SOC2", "HIPAA"],
            "audit_retention_days": 730,
            "dlp_enabled": True,
            "dlp_patterns": [{"label": "EIN", "pattern": r"\b\d{2}-\d{7}\b"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["brand_name"] == "Acme Cowork"
    assert body["compliance_frameworks"] == ["SOC2", "HIPAA"]
    assert body["audit_retention_days"] == 730
    assert body["dlp_patterns"][0]["label"] == "EIN"


@pytest.mark.asyncio
async def test_patch_rejects_invalid_theme(client: AsyncClient, admin_token: str):
    resp = await client.patch(
        "/tenant/settings",
        json={"default_theme": "purple"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422
