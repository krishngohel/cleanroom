from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import User, WorkflowRun, get_db

router = APIRouter(tags=["workflows"])


class RunWorkflowRequest(BaseModel):
    parameters: dict = {}


@router.get("/workflows")
async def list_workflows(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    engine = request.app.state.workflow_engine
    return engine.list_workflows()


@router.get("/workflows/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    engine = request.app.state.workflow_engine
    workflow = engine.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workflow '{workflow_id}' not found")
    return workflow


@router.post("/workflows/{workflow_id}/run")
async def run_workflow(
    workflow_id: str,
    body: RunWorkflowRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = request.app.state.workflow_engine
    registry = request.app.state.connector_registry

    try:
        result = await engine.execute(
            workflow_id=workflow_id,
            parameters=body.parameters,
            user=current_user,
            db=db,
            registry=registry,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Workflow execution failed: {e}")

    return result


@router.get("/workflow-runs")
async def list_workflow_runs(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkflowRun)
        .where(WorkflowRun.user_id == current_user.id)
        .order_by(WorkflowRun.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    runs = result.scalars().all()
    return [
        {
            "id": r.id,
            "workflow_id": r.workflow_id,
            "parameters": r.parameters,
            "model_used": r.model_used,
            "duration_ms": r.duration_ms,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in runs
    ]


@router.get("/workflow-runs/{run_id}")
async def get_workflow_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkflowRun).where(
            WorkflowRun.id == run_id,
            WorkflowRun.user_id == current_user.id,
        )
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    return {
        "id": run.id,
        "workflow_id": run.workflow_id,
        "parameters": run.parameters,
        "response": run.response,
        "model_used": run.model_used,
        "duration_ms": run.duration_ms,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }
