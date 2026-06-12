"""Scheduled agent tasks — recurring jobs that run inside your network.

A lightweight asyncio loop (no external scheduler dependency — install
footprint matters for air-gapped deployments). Every minute it checks for
due tasks and runs them through the same agent engine the dashboard uses,
storing the result as an AgentRun the user can open later.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from pathlib import Path

import structlog
from sqlalchemy import select

from ..agent.engine import run_agent
from ..agent.tools import ToolContext
from ..database import AgentRun, AsyncSessionLocal, ScheduledTask, Workspace

log = structlog.get_logger()

CHECK_INTERVAL_SECONDS = 60


def _is_due(task: ScheduledTask, now: datetime) -> bool:
    if not task.enabled:
        return False
    last = task.last_run_at
    if task.schedule_kind == "interval":
        if last is None:
            return True
        return now - last >= timedelta(minutes=max(1, task.interval_minutes))
    # daily at HH:MM (server time)
    try:
        hh, mm = (int(x) for x in task.daily_time.split(":"))
    except ValueError:
        hh, mm = 8, 0
    today_run = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if now < today_run:
        return False
    return last is None or last < today_run


class TaskScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        if self._task is None:
            self._stop.clear()
            self._task = asyncio.get_event_loop().create_task(self._loop())
            log.info("scheduler_started")

    def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            self._task = None
            log.info("scheduler_stopped")

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self._tick()
            except Exception as e:  # noqa: BLE001 — scheduler must survive anything
                log.warning("scheduler_tick_failed", error=str(e))
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=CHECK_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        now = datetime.utcnow()
        async with AsyncSessionLocal() as db:
            tasks = (
                (await db.execute(select(ScheduledTask).where(ScheduledTask.enabled)))
                .scalars()
                .all()
            )
            due = [t for t in tasks if _is_due(t, now)]
        for t in due:
            await self.run_task(t.id)

    async def run_task(self, task_id: str) -> str | None:
        """Run one scheduled task now. Returns the AgentRun id."""
        async with AsyncSessionLocal() as db:
            t = (
                await db.execute(select(ScheduledTask).where(ScheduledTask.id == task_id))
            ).scalar_one_or_none()
            if t is None:
                return None

            root: Path | None = None
            if t.workspace_id:
                ws = (
                    await db.execute(select(Workspace).where(Workspace.id == t.workspace_id))
                ).scalar_one_or_none()
                if ws is not None and Path(ws.root_path).exists():
                    root = Path(ws.root_path)

            run_row = AgentRun(
                user_id=t.user_id,
                username=t.username,
                prompt=f"[Scheduled: {t.name}] {t.prompt}",
                workspace_id=t.workspace_id,
                status="running",
            )
            db.add(run_row)
            t.last_run_at = datetime.utcnow()
            await db.commit()
            run_id = run_row.id

        log.info("scheduled_task_running", task=task_id, run=run_id)
        ctx = ToolContext(workspace_root=root)
        events: list[dict] = []
        answer = ""
        final_status = "completed"
        try:
            async for event in run_agent(run_row.prompt, ctx):
                events.append(event)
                if event["type"] == "answer":
                    answer = event["text"]
                if event["type"] == "error":
                    final_status = "error"
        except Exception as e:  # noqa: BLE001
            final_status = "error"
            events.append({"type": "error", "message": str(e)})

        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(select(AgentRun).where(AgentRun.id == run_id))
            ).scalar_one_or_none()
            if row is not None:
                row.status = final_status
                row.events = events
                row.answer = answer
                row.finished_at = datetime.utcnow()
            t2 = (
                await db.execute(select(ScheduledTask).where(ScheduledTask.id == task_id))
            ).scalar_one_or_none()
            if t2 is not None:
                t2.last_run_id = run_id
                t2.last_status = final_status
            await db.commit()
        return run_id
