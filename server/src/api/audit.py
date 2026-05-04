from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_role
from ..database import AuditLog, User, get_db

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
async def list_audit_logs(
    user_id: str | None = Query(None),
    username: str | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc())

    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if username:
        stmt = stmt.where(AuditLog.username.ilike(f"%{username}%"))
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "username": log.username,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "ip_address": log.ip_address,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            }
            for log in logs
        ],
        "offset": offset,
        "limit": limit,
    }
