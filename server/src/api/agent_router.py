"""Agent API — run agentic tasks with live progress streaming.

POST /v1/agent/run        — SSE stream of agent events (plan, tools, answer)
GET  /v1/agent/runs       — recent runs for the current user
GET  /v1/agent/runs/{id}  — full event trace of one run
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agent.engine import run_agent
from ..agent.tools import ToolContext
from ..auth import get_current_user
from ..database import AgentRun, AsyncSessionLocal, AuditLog, User, Workspace, get_db

router = APIRouter(prefix="/v1/agent", tags=["agent"])


class AgentRunRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    workspace_id: str | None = None
    model: str | None = None


async def _workspace_root(
    db: AsyncSession, workspace_id: str | None, user: User
) -> Path | None:
    if not workspace_id:
        return None
    ws = (
        await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ).scalar_one_or_none()
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    if not ws.is_shared and ws.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this workspace")
    root = Path(ws.root_path)
    if not root.exists():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Workspace folder missing on disk")
    return root


@router.post("/run")
async def run(
    request: Request,
    body: AgentRunRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    root = await _workspace_root(db, body.workspace_id, current_user)

    run_row = AgentRun(
        user_id=current_user.id,
        username=current_user.username,
        prompt=body.prompt,
        workspace_id=body.workspace_id,
        status="running",
    )
    db.add(run_row)
    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="agent_run_started",
            resource_type="agent",
            resource_id=run_row.id,
            details={"prompt_chars": len(body.prompt), "workspace_id": body.workspace_id},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    run_id = run_row.id

    ctx = ToolContext(
        workspace_root=root,
        workflow_engine=getattr(request.app.state, "workflow_engine", None),
        connector_registry=getattr(request.app.state, "connector_registry", None),
        user=current_user,
        db=db,
    )

    user_id = current_user.id
    username = current_user.username
    ip = request.client.host if request.client else None

    async def audit(tool: str, summary: str, ok: bool) -> None:
        # Separate session: the request session is busy inside the stream.
        async with AsyncSessionLocal() as adb:
            adb.add(
                AuditLog(
                    user_id=user_id,
                    username=username,
                    action=f"agent_tool_{tool}",
                    resource_type="agent",
                    resource_id=run_id,
                    details={"args": summary, "ok": ok},
                    ip_address=ip,
                )
            )
            await adb.commit()

    async def stream():
        events: list[dict] = []
        answer = ""
        model_used = body.model or ""
        final_status = "completed"
        yield f"data: {json.dumps({'type': 'run', 'id': run_id})}\n\n"
        try:
            async for event in run_agent(body.prompt, ctx, model=body.model, audit=audit):
                events.append(event)
                if event["type"] == "answer":
                    answer = event["text"]
                if event["type"] == "error":
                    final_status = "error"
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:  # noqa: BLE001 — surface, never hang the client
            final_status = "error"
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        async with AsyncSessionLocal() as sdb:
            row = (
                await sdb.execute(select(AgentRun).where(AgentRun.id == run_id))
            ).scalar_one_or_none()
            if row is not None:
                row.status = final_status
                row.events = events
                row.answer = answer
                row.model = model_used
                row.finished_at = datetime.utcnow()
                await sdb.commit()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/runs")
async def list_runs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(AgentRun).order_by(AgentRun.created_at.desc()).limit(50)
    if current_user.role != "admin":
        q = q.where(AgentRun.user_id == current_user.id)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": r.id,
            "prompt": r.prompt[:200],
            "status": r.status,
            "answer_preview": r.answer[:200],
            "created_at": r.created_at.isoformat(),
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "workspace_id": r.workspace_id,
        }
        for r in rows
    ]


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = (await db.execute(select(AgentRun).where(AgentRun.id == run_id))).scalar_one_or_none()
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if r.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this run")
    return {
        "id": r.id,
        "prompt": r.prompt,
        "status": r.status,
        "events": r.events,
        "answer": r.answer,
        "created_at": r.created_at.isoformat(),
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "workspace_id": r.workspace_id,
    }
