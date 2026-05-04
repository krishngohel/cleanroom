from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, get_current_user, verify_password
from ..database import AuditLog, User, get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.username == form_data.username, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form_data.password, user.hashed_password):
        await db.execute(
            AuditLog.__table__.insert().values(
                username=form_data.username,
                action="login_failed",
                resource_type="auth",
                ip_address=request.client.host if request.client else None,
            )
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    user.last_login = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="login",
            resource_type="auth",
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()

    token = create_access_token({"sub": user.id, "username": user.username, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
        },
    }


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "groups": current_user.groups,
    }
