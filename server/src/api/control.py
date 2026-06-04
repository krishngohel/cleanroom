"""Audit endpoint for Computer Use control events.

The actual mouse/keyboard control happens between the browser and a local
agent running on the user's machine — the Cleanroom server never touches the
user's OS. But every action the assistant performs is reported here so it
lands in the immutable audit log alongside everything else (chat completions,
file writes, etc).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import AuditLog, TenantSettings, User, get_db

router = APIRouter(prefix="/control", tags=["control"])


class ControlEvent(BaseModel):
    action: str = Field(min_length=1, max_length=64)
    target: str | None = Field(default=None, max_length=200)
    summary: str = Field(min_length=1, max_length=400)
    approved: bool = True
    details: dict | None = None


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def record_control_event(
    request: Request,
    body: ControlEvent,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Record a single computer-control action to the audit log.

    Rejects the event with 403 if the tenant has not enabled Computer Use.
    """
    settings_row = (await db.execute(select(TenantSettings).limit(1))).scalar_one_or_none()
    if settings_row is None or not settings_row.computer_control_enabled:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Computer Use is not enabled for this tenant",
        )

    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action=f"control_{body.action}",
            resource_type="computer_control",
            resource_id=body.target,
            details={
                "summary": body.summary,
                "approved": body.approved,
                **(body.details or {}),
            },
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"recorded": True}
