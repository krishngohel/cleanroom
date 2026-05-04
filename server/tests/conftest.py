from __future__ import annotations

import asyncio
import os
from pathlib import Path

# Must be set before any src.* imports so pydantic-settings reads the test URL.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_cleanroom.db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-testing-only")

# ── Imports (after env vars) ──────────────────────────────────────────────────
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.auth import create_default_admin
from src.connectors.registry import ConnectorRegistry
from src.database import AsyncSessionLocal, init_db
from src.main import TEMPLATES_DIR, app
from src.workflows.engine import WorkflowEngine

# ── One-time session setup ────────────────────────────────────────────────────
_TEST_DB = Path(__file__).parent.parent / "test_cleanroom.db"

# Delete stale DB so each test session starts clean.
if _TEST_DB.exists():
    _TEST_DB.unlink()


async def _bootstrap() -> None:
    """Create tables, default admin, and populate app.state before tests run."""
    await init_db()
    await create_default_admin()

    registry = ConnectorRegistry()
    async with AsyncSessionLocal() as db:
        await registry.load_from_db(db)
    app.state.connector_registry = registry

    wf_engine = WorkflowEngine()
    wf_engine.load_workflows(TEMPLATES_DIR)
    app.state.workflow_engine = wf_engine


# Run synchronously at conftest import time — once per session, no fixture scope issues.
asyncio.run(_bootstrap())


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client() -> AsyncClient:
    # Use raise_app_exceptions=True so test failures surface clearly.
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=True),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient) -> str:
    resp = await client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def user_token(client: AsyncClient, admin_token: str) -> str:
    # 409 = already exists from a previous test; both are acceptable.
    create = await client.post(
        "/admin/users",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "testpass",
            "role": "user",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create.status_code in (201, 409), f"User creation failed: {create.text}"
    resp = await client.post(
        "/auth/login",
        data={"username": "testuser", "password": "testpass"},
    )
    assert resp.status_code == 200, f"User login failed: {resp.text}"
    return resp.json()["access_token"]
