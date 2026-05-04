from __future__ import annotations

import pytest
from httpx import AsyncClient


async def test_admin_users_requires_admin(client: AsyncClient, user_token: str):
    resp = await client.get("/admin/users", headers={"Authorization": f"Bearer {user_token}"})
    assert resp.status_code == 403


async def test_admin_users_list(client: AsyncClient, admin_token: str):
    resp = await client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    users = resp.json()
    assert isinstance(users, list)
    usernames = [u["username"] for u in users]
    assert "admin" in usernames


async def test_create_user(client: AsyncClient, admin_token: str):
    resp = await client.post(
        "/admin/users",
        json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "secure123",
            "role": "user",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["username"] == "newuser"


async def test_create_duplicate_user(client: AsyncClient, admin_token: str):
    await client.post(
        "/admin/users",
        json={"username": "dupuser", "email": "dup@example.com", "password": "pass", "role": "user"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = await client.post(
        "/admin/users",
        json={"username": "dupuser", "email": "dup2@example.com", "password": "pass", "role": "user"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 409


async def test_audit_log_requires_admin(client: AsyncClient, user_token: str):
    resp = await client.get("/audit/logs", headers={"Authorization": f"Bearer {user_token}"})
    assert resp.status_code == 403


async def test_audit_log_accessible_to_admin(client: AsyncClient, admin_token: str):
    resp = await client.get("/audit/logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "logs" in data
