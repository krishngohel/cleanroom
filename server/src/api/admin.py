from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import hash_password, require_role
from ..database import AuditLog, Connector, User, get_db

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Users ─────────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"
    groups: list[str] = []


class UpdateUserRequest(BaseModel):
    role: str | None = None
    groups: list[str] | None = None
    is_active: bool | None = None


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "groups": u.groups,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        }
        for u in users
    ]


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    request: Request,
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        groups=body.groups,
    )
    db.add(user)
    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="create_user",
            resource_type="user",
            resource_id=body.username,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"id": user.id, "username": user.username, "role": user.role}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    request: Request,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.role is not None:
        user.role = body.role
    if body.groups is not None:
        user.groups = body.groups
    if body.is_active is not None:
        user.is_active = body.is_active

    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="update_user",
            resource_type="user",
            resource_id=user.username,
            details=body.model_dump(exclude_none=True),
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"id": user.id, "username": user.username, "role": user.role, "is_active": user.is_active}


# ── Connectors ────────────────────────────────────────────────────────────────

class CreateConnectorRequest(BaseModel):
    name: str
    connector_type: str
    config: dict
    description: str | None = None


class UpdateConnectorRequest(BaseModel):
    name: str | None = None
    config: dict | None = None
    description: str | None = None
    is_active: bool | None = None


@router.get("/connectors")
async def list_connectors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(Connector).order_by(Connector.created_at))
    connectors = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "connector_type": c.connector_type,
            "description": c.description,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in connectors
    ]


@router.post("/connectors", status_code=status.HTTP_201_CREATED)
async def create_connector(
    request: Request,
    body: CreateConnectorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    existing = await db.execute(select(Connector).where(Connector.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connector name already exists")

    connector = Connector(
        name=body.name,
        connector_type=body.connector_type,
        config=body.config,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(connector)
    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="create_connector",
            resource_type="connector",
            resource_id=body.name,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"id": connector.id, "name": connector.name, "connector_type": connector.connector_type}


@router.patch("/connectors/{connector_id}")
async def update_connector(
    connector_id: str,
    request: Request,
    body: UpdateConnectorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if connector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")

    if body.name is not None:
        connector.name = body.name
    if body.config is not None:
        connector.config = body.config
    if body.description is not None:
        connector.description = body.description
    if body.is_active is not None:
        connector.is_active = body.is_active

    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="update_connector",
            resource_type="connector",
            resource_id=connector.name,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"id": connector.id, "name": connector.name, "is_active": connector.is_active}
