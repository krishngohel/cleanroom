from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import settings


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    groups: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    workflow_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    parameters: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    response: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Connector(Base):
    __tablename__ = "connectors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    connector_type: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    default_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#38bdf8")
    icon: Mapped[str] = mapped_column(String(16), nullable=False, default="✨")
    owner_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProjectFile(Base):
    __tablename__ = "project_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Prompt(Base):
    """A saved, reusable prompt the user can insert into chat with one click.

    Each prompt has a title, an optional slash command (e.g. "summarize")
    and a body that's pasted into the chat composer. Shared prompts are
    visible to the whole tenant; owned prompts are private.
    """

    __tablename__ = "prompts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    slash: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="general")
    icon: Mapped[str] = mapped_column(String(16), nullable=False, default="✨")
    owner_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Workspace(Base):
    """A sandboxed root directory the AI can read/edit files in.

    Stored as a server-side path. All file operations resolve under this path —
    requests that escape via `..` or absolute paths are rejected at the API layer.
    """

    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    root_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_writable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class TenantSettings(Base):
    __tablename__ = "tenant_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    brand_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Cleanroom Cowork")
    default_theme: Mapped[str] = mapped_column(String(10), nullable=False, default="dark")
    allow_theme_toggle: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    accent_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    overlay_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Compliance configuration. Cleanroom is sold as a compliance-grade
    # equivalent to Claude Cowork — these fields drive the disclosure
    # banner, audit retention, and client-side DLP redaction.
    compliance_frameworks: Mapped[list] = mapped_column(
        JSON, nullable=False, default=lambda: ["SOC2"]
    )
    data_residency: Mapped[str] = mapped_column(String(64), nullable=False, default="on-prem")
    audit_retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=365)
    require_disclosure_banner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    disclosure_text: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        default=(
            "Conversations are logged for compliance and audit. "
            "Your data stays inside your organization's network."
        ),
    )
    dlp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    dlp_patterns: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: [
            {"label": "EMAIL", "pattern": r"[\w.+-]+@[\w-]+\.[\w.-]+"},
            {"label": "SSN", "pattern": r"\b\d{3}-\d{2}-\d{4}\b"},
            {"label": "CC", "pattern": r"\b(?:\d[ -]*?){13,16}\b"},
            {"label": "PHONE", "pattern": r"\b(?:\+?1[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b"},
        ],
    )

    # Assistant Dock — optional dockable side panel that follows the user
    # across pages, with optional vision (screen capture) and cursor/keyboard
    # control via a local agent. Computer-control is *off* by default and
    # must be explicitly enabled per tenant.
    assistant_dock_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    computer_control_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    agent_socket_url: Mapped[str] = mapped_column(
        String(200), nullable=False, default="ws://127.0.0.1:9777"
    )
    require_action_confirmation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
