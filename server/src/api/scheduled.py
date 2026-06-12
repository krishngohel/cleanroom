"""CRUD for scheduled agent tasks, plus run-now."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import AuditLog, ScheduledTask, User, get_db

router = APIRouter(prefix="/v1/scheduled-tasks", tags=["scheduled-tasks"])


class ScheduledTaskIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=8000)
    schedule_kind: str = Field(default="daily", pattern="^(daily|interval)$")
    interval_minutes: int = Field(default=1440, ge=5, le=10080)
    daily_time: str = Field(default="08:00", pattern=r"^\d{2}:\d{2}$")
    enabled: bool = True
    workspace_id: str | None = None


def _serialize(t: ScheduledTask) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "prompt": t.prompt,
        "schedule_kind": t.schedule_kind,
        "interval_minutes": t.interval_minutes,
        "daily_time": t.daily_time,
        "enabled": t.enabled,
        "workspace_id": t.workspace_id,
        "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
        "last_run_id": t.last_run_id,
        "last_status": t.last_status,
        "created_at": t.created_at.isoformat(),
    }


async def _get_or_403(db: AsyncSession, task_id: str, user: User) -> ScheduledTask:
    t = (
        await db.execute(select(ScheduledTask).where(ScheduledTask.id == task_id))
    ).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled task not found")
    if t.user_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this task")
    return t


@router.get("")
async def list_tasks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(ScheduledTask).order_by(ScheduledTask.created_at.desc())
    if current_user.role != "admin":
        q = q.where(ScheduledTask.user_id == current_user.id)
    rows = (await db.execute(q)).scalars().all()
    return [_serialize(t) for t in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_task(
    request: Request,
    body: ScheduledTaskIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = ScheduledTask(
        user_id=current_user.id,
        username=current_user.username,
        **body.model_dump(),
    )
    db.add(t)
    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="scheduled_task_created",
            resource_type="scheduled_task",
            resource_id=t.id,
            details={"name": body.name, "kind": body.schedule_kind},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return _serialize(t)


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    body: ScheduledTaskIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await _get_or_403(db, task_id, current_user)
    for k, v in body.model_dump().items():
        setattr(t, k, v)
    await db.commit()
    return _serialize(t)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await _get_or_403(db, task_id, current_user)
    await db.delete(t)
    await db.commit()


@router.post("/{task_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_now(
    task_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_403(db, task_id, current_user)
    scheduler = getattr(request.app.state, "task_scheduler", None)
    if scheduler is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Scheduler not running")
    asyncio.get_event_loop().create_task(scheduler.run_task(task_id))
    return {"started": True}
