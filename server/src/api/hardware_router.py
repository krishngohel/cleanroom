"""Hardware status and model auto-configuration endpoints.

GET  /v1/hardware          — detected hardware, recommendation, active model
POST /v1/hardware/refresh  — re-probe the host (admin)
POST /v1/hardware/model    — override the active model, or return to auto (admin)
POST /v1/hardware/pull     — pull a catalog model in the background (admin)
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import AuditLog, User, get_db
from ..hardware import MODEL_CATALOG, get_model_manager

router = APIRouter(prefix="/v1/hardware", tags=["hardware"])


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")


@router.get("")
async def hardware_status(current_user: User = Depends(get_current_user)):
    mgr = get_model_manager()
    if mgr.profile is None:
        mgr.detect()
    data = mgr.status()
    data["installed"] = await mgr.installed_models()
    return data


@router.post("/refresh")
async def refresh_hardware(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    mgr = get_model_manager()
    mgr.detect()
    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="hardware_refresh",
            resource_type="system",
            resource_id="hardware",
            details=mgr.profile.to_dict() if mgr.profile else {},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return mgr.status()


class ModelOverrideRequest(BaseModel):
    model: str | None = None  # None or "auto" → automatic mode


@router.post("/model")
async def set_model(
    request: Request,
    body: ModelOverrideRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    mgr = get_model_manager()

    if body.model and body.model != "auto":
        known = {m.id for m in MODEL_CATALOG}
        installed = await mgr.installed_models()
        if body.model not in known and body.model not in installed:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unknown model '{body.model}' — not in catalog and not installed",
            )

    await mgr.set_override(db, body.model)
    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="model_override",
            resource_type="model",
            resource_id=body.model or "auto",
            details={"active_model": mgr.active_model},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"active_model": mgr.active_model, "override": mgr.override}


class PullRequest(BaseModel):
    model: str


@router.post("/pull", status_code=status.HTTP_202_ACCEPTED)
async def pull_model(
    request: Request,
    body: PullRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    mgr = get_model_manager()
    if mgr.pull_status.get("state") == "pulling":
        raise HTTPException(status.HTTP_409_CONFLICT, "A model pull is already in progress")

    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="model_pull",
            resource_type="model",
            resource_id=body.model,
            details={},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()

    asyncio.get_event_loop().create_task(mgr.pull_model(body.model))
    return {"started": True, "model": body.model}
