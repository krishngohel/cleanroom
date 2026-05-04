from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user
from ..config import settings
from ..database import User

router = APIRouter(tags=["models"])


@router.get("/v1/models")
async def list_models(current_user: User = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is unavailable",
            )

    data = resp.json()
    models = [
        {
            "id": m["name"],
            "object": "model",
            "created": 0,
            "owned_by": "local",
        }
        for m in data.get("models", [])
    ]
    return {"object": "list", "data": models}


@router.get("/v1/models/{model_id:path}")
async def get_model(model_id: str, current_user: User = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI runtime unavailable")

    models = resp.json().get("models", [])
    match = next((m for m in models if m["name"] == model_id), None)
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Model '{model_id}' not found")

    return {"id": match["name"], "object": "model", "created": 0, "owned_by": "local"}
