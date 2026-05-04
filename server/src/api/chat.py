from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import settings
from ..database import AuditLog, User, get_db

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None


@router.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    model = body.model or settings.default_model
    payload: dict = {
        "model": model,
        "messages": [m.model_dump() for m in body.messages],
        "stream": body.stream,
    }
    if body.temperature is not None:
        payload["temperature"] = body.temperature
    if body.max_tokens is not None:
        payload["max_tokens"] = body.max_tokens

    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="chat_completion",
            resource_type="model",
            resource_id=model,
            details={"message_count": len(body.messages), "stream": body.stream},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()

    ollama_url = f"{settings.ollama_base_url}/v1/chat/completions"

    if body.stream:
        return StreamingResponse(
            _stream_ollama(ollama_url, payload),
            media_type="text/event-stream",
        )

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.post(ollama_url, json=payload)
            resp.raise_for_status()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is unavailable. Ensure Ollama is running.",
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=str(e))

    return resp.json()


async def _stream_ollama(url: str, payload: dict) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            async with client.stream("POST", url, json=payload) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        yield f"{line}\n\n"
                    elif line == "data: [DONE]":
                        yield "data: [DONE]\n\n"
                        break
        except httpx.ConnectError:
            error = json.dumps({"error": "AI runtime unavailable"})
            yield f"data: {error}\n\n"
