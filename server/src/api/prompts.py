from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import AuditLog, Prompt, User, get_db

router = APIRouter(prefix="/prompts", tags=["prompts"])

SLASH_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")


class CreatePromptRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=8000)
    slash: str | None = None
    category: str = "general"
    icon: str = "✨"
    is_shared: bool = False


class UpdatePromptRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    slash: str | None = None
    category: str | None = None
    icon: str | None = None
    is_shared: bool | None = None


def _validate_slash(slash: str | None) -> str | None:
    if slash is None:
        return None
    s = slash.lstrip("/").strip().lower()
    if not s:
        return None
    if not SLASH_RE.match(s):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Slash command must be 1–40 chars: lowercase letters, numbers, _ or -",
        )
    return s


def _serialize(p: Prompt) -> dict[str, Any]:
    return {
        "id": p.id,
        "title": p.title,
        "slash": p.slash,
        "body": p.body,
        "category": p.category,
        "icon": p.icon,
        "owner_id": p.owner_id,
        "is_shared": p.is_shared,
        "use_count": p.use_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
async def list_prompts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Prompt).where(
        (Prompt.owner_id == user.id) | (Prompt.is_shared == True)  # noqa: E712
    )
    result = await db.execute(q.order_by(Prompt.use_count.desc(), Prompt.title))
    return [_serialize(p) for p in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_prompt(
    request: Request,
    body: CreatePromptRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    slash = _validate_slash(body.slash)
    if slash:
        # Enforce per-user uniqueness of slash command.
        existing = await db.execute(
            select(Prompt).where(
                Prompt.slash == slash,
                ((Prompt.owner_id == user.id) | (Prompt.is_shared == True)),  # noqa: E712
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Slash command /{slash} is already in use"
            )

    p = Prompt(
        title=body.title,
        body=body.body,
        slash=slash,
        category=body.category,
        icon=body.icon,
        owner_id=user.id,
        is_shared=body.is_shared,
    )
    db.add(p)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="create_prompt",
            resource_type="prompt",
            resource_id=body.title,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(p)
    return _serialize(p)


@router.patch("/{prompt_id}")
async def update_prompt(
    prompt_id: str,
    body: UpdatePromptRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = (await db.execute(select(Prompt).where(Prompt.id == prompt_id))).scalar_one_or_none()
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prompt not found")
    if p.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or admin can edit")
    data = body.model_dump(exclude_none=True)
    if "slash" in data:
        data["slash"] = _validate_slash(data["slash"])
    for k, v in data.items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return _serialize(p)


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = (await db.execute(select(Prompt).where(Prompt.id == prompt_id))).scalar_one_or_none()
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prompt not found")
    if p.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or admin can delete")
    await db.delete(p)
    await db.commit()


@router.post("/{prompt_id}/use")
async def increment_use(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = (await db.execute(select(Prompt).where(Prompt.id == prompt_id))).scalar_one_or_none()
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prompt not found")
    p.use_count += 1
    await db.commit()
    return {"use_count": p.use_count}
