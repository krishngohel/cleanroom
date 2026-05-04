from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import settings
from ..database import Connector, User, get_db
from sqlalchemy import select, func

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "healthy", "version": "0.1.0"}


@router.get("/status")
async def status_check(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check Ollama
    ollama_connected = False
    available_models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                ollama_connected = True
                available_models = [m["name"] for m in resp.json().get("models", [])]
    except (httpx.ConnectError, httpx.TimeoutException):
        pass

    # Check DB
    db_connected = False
    try:
        await db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        pass

    # Connector counts
    total_result = await db.execute(select(func.count()).select_from(Connector))
    active_result = await db.execute(
        select(func.count()).select_from(Connector).where(Connector.is_active == True)  # noqa: E712
    )
    total_connectors = total_result.scalar() or 0
    active_connectors = active_result.scalar() or 0

    overall = "ok" if (ollama_connected and db_connected) else "degraded"

    return {
        "status": overall,
        "version": "0.1.0",
        "ollama": {"connected": ollama_connected, "models": available_models},
        "database": {"connected": db_connected},
        "connectors": {"total": total_connectors, "active": active_connectors},
    }
