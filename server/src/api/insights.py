from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_role
from ..database import AuditLog, Project, User, Workspace, get_db

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/summary")
async def insights_summary(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """High-level usage stats for the admin dashboard, derived from audit logs."""
    since = datetime.utcnow() - timedelta(days=max(1, min(days, 365)))

    # Total activity by action type
    by_action_q = (
        select(AuditLog.action, func.count(AuditLog.id))
        .where(AuditLog.timestamp >= since)
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
    )
    by_action = [
        {"action": row[0], "count": row[1]}
        for row in (await db.execute(by_action_q)).all()
    ]

    # Top users by activity
    top_users_q = (
        select(AuditLog.username, func.count(AuditLog.id))
        .where(AuditLog.timestamp >= since, AuditLog.username.is_not(None))
        .group_by(AuditLog.username)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_users = [
        {"username": row[0], "count": row[1]}
        for row in (await db.execute(top_users_q)).all()
    ]

    # Daily activity buckets — sqlite-compatible by truncating to date string
    daily_q = (
        select(func.substr(func.cast(AuditLog.timestamp, type_=AuditLog.timestamp.type), 1, 10), func.count(AuditLog.id))
        .where(AuditLog.timestamp >= since)
        .group_by(func.substr(func.cast(AuditLog.timestamp, type_=AuditLog.timestamp.type), 1, 10))
        .order_by(func.substr(func.cast(AuditLog.timestamp, type_=AuditLog.timestamp.type), 1, 10))
    )
    daily = [
        {"day": row[0], "count": row[1]}
        for row in (await db.execute(daily_q)).all()
    ]

    # Chats specifically
    chats_total = (
        await db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.timestamp >= since, AuditLog.action == "chat_completion"
            )
        )
    ).scalar() or 0

    # Counts of "things" currently in the system
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_projects = (await db.execute(select(func.count(Project.id)))).scalar() or 0
    total_workspaces = (await db.execute(select(func.count(Workspace.id)))).scalar() or 0

    return {
        "since": since.isoformat(),
        "days": days,
        "totals": {
            "users": total_users,
            "projects": total_projects,
            "workspaces": total_workspaces,
            "chats_in_period": chats_total,
            "audit_events_in_period": sum(b["count"] for b in by_action),
        },
        "by_action": by_action,
        "top_users": top_users,
        "daily": daily,
    }
