from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_role
from ..database import AuditLog, TenantSettings, User, get_db

router = APIRouter(prefix="/tenant", tags=["tenant"])


class DlpPattern(BaseModel):
    label: str
    pattern: str


class TenantSettingsUpdate(BaseModel):
    brand_name: str | None = None
    default_theme: str | None = Field(default=None, pattern="^(light|dark)$")
    allow_theme_toggle: bool | None = None
    accent_color: str | None = None
    logo_url: str | None = None
    overlay_enabled: bool | None = None
    compliance_frameworks: list[str] | None = None
    data_residency: str | None = None
    audit_retention_days: int | None = Field(default=None, ge=1, le=3650)
    require_disclosure_banner: bool | None = None
    disclosure_text: str | None = None
    dlp_enabled: bool | None = None
    dlp_patterns: list[DlpPattern] | None = None
    assistant_dock_enabled: bool | None = None
    computer_control_enabled: bool | None = None
    agent_socket_url: str | None = Field(default=None, max_length=200)
    require_action_confirmation: bool | None = None


async def _get_or_create(db: AsyncSession) -> TenantSettings:
    result = await db.execute(select(TenantSettings).limit(1))
    row = result.scalar_one_or_none()
    if row is None:
        row = TenantSettings()
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _serialize(row: TenantSettings) -> dict[str, Any]:
    return {
        "brand_name": row.brand_name,
        "default_theme": row.default_theme,
        "allow_theme_toggle": row.allow_theme_toggle,
        "accent_color": row.accent_color,
        "logo_url": row.logo_url,
        "overlay_enabled": row.overlay_enabled,
        "compliance_frameworks": row.compliance_frameworks,
        "data_residency": row.data_residency,
        "audit_retention_days": row.audit_retention_days,
        "require_disclosure_banner": row.require_disclosure_banner,
        "disclosure_text": row.disclosure_text,
        "dlp_enabled": row.dlp_enabled,
        "dlp_patterns": row.dlp_patterns,
        "assistant_dock_enabled": row.assistant_dock_enabled,
        "computer_control_enabled": row.computer_control_enabled,
        "agent_socket_url": row.agent_socket_url,
        "require_action_confirmation": row.require_action_confirmation,
    }


@router.get("/settings")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    row = await _get_or_create(db)
    return _serialize(row)


@router.get("/public-settings")
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Pre-auth endpoint so login page can pre-style itself.

    Note: does NOT include compliance_frameworks or DLP patterns (those leak
    organizational posture; only authenticated users can read those).
    """
    row = await _get_or_create(db)
    return {
        "brand_name": row.brand_name,
        "default_theme": row.default_theme,
        "allow_theme_toggle": row.allow_theme_toggle,
        "accent_color": row.accent_color,
        "logo_url": row.logo_url,
        "assistant_dock_enabled": row.assistant_dock_enabled,
    }


@router.patch("/settings")
async def update_settings(
    request: Request,
    body: TenantSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    row = await _get_or_create(db)

    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    # Pydantic returns nested models as plain dicts via model_dump above,
    # but DlpPattern is a BaseModel with .pattern, so make sure they're
    # serialized as plain dicts for the JSON column.
    if "dlp_patterns" in data and data["dlp_patterns"] is not None:
        data["dlp_patterns"] = [
            {"label": p["label"], "pattern": p["pattern"]} for p in data["dlp_patterns"]
        ]

    for k, v in data.items():
        setattr(row, k, v)

    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action="update_tenant_settings",
            resource_type="tenant",
            resource_id="default",
            details={k: data[k] for k in data if k != "dlp_patterns"},  # don't log raw regexes
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(row)
    return _serialize(row)
