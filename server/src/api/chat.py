from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import settings
from ..database import AuditLog, Project, ProjectFile, User, get_db

router = APIRouter(tags=["chat"])

MAX_PROJECT_CONTEXT_BYTES = 80_000


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    project_id: str | None = None


async def _build_project_context(
    db: AsyncSession, project_id: str, user: User
) -> tuple[str | None, int]:
    """Return (system_prompt_with_files, bytes_added). None if project missing."""
    p = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if p is None:
        return None, 0
    if not p.is_shared and p.owner_id != user.id and user.role != "admin":
        return None, 0

    files_result = await db.execute(
        select(ProjectFile)
        .where(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.created_at)
    )
    files = files_result.scalars().all()

    parts = []
    if p.system_prompt.strip():
        parts.append(p.system_prompt.strip())

    if files:
        parts.append("## Project knowledge files\n")
        running = 0
        for f in files:
            block = f"### {f.filename}\n```\n{f.content}\n```\n"
            if running + len(block) > MAX_PROJECT_CONTEXT_BYTES:
                parts.append(f"_…{len(files) - files.index(f)} more files truncated for context length…_")
                break
            parts.append(block)
            running += len(block)

    composed = "\n\n".join(parts).strip()
    return composed or None, len(composed)


@router.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    model = body.model or settings.default_model
    messages = [m.model_dump() for m in body.messages]

    project_ctx_bytes = 0
    if body.project_id:
        ctx, project_ctx_bytes = await _build_project_context(db, body.project_id, current_user)
        if ctx:
            # Prepend a system message with the project knowledge. If the caller
            # already sent a system message, keep theirs after ours so the
            # caller's instructions win.
            messages = [{"role": "system", "content": ctx}, *messages]

    payload: dict = {
        "model": model,
        "messages": messages,
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
            details={
                "message_count": len(body.messages),
                "stream": body.stream,
                "project_id": body.project_id,
                "project_context_bytes": project_ctx_bytes,
            },
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
