from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import prometheus_client
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import create_default_admin
from .config import settings
from .connectors.registry import ConnectorRegistry
from .database import AsyncSessionLocal, init_db
from .workflows.engine import WorkflowEngine

from .api.auth_router import router as auth_router
from .api.chat import router as chat_router
from .api.models_router import router as models_router
from .api.workflows import router as workflows_router
from .api.admin import router as admin_router
from .api.health import router as health_router
from .api.audit import router as audit_router
from .api.tenant import router as tenant_router
from .api.projects import router as projects_router
from .api.code import router as code_router
from .api.prompts import router as prompts_router
from .api.search import router as search_router
from .api.insights import router as insights_router
from .api.control import router as control_router

log = structlog.get_logger()

# Prometheus metrics
REQUEST_COUNT = prometheus_client.Counter(
    "cleanroom_http_requests_total", "Total HTTP requests", ["method", "path", "status"]
)
REQUEST_DURATION = prometheus_client.Histogram(
    "cleanroom_http_request_duration_seconds", "HTTP request duration"
)
ACTIVE_USERS = prometheus_client.Gauge("cleanroom_active_users", "Approximate active users")
WORKFLOW_RUNS = prometheus_client.Counter(
    "cleanroom_workflow_runs_total", "Total workflow executions", ["workflow_id"]
)
CHAT_COMPLETIONS = prometheus_client.Counter(
    "cleanroom_chat_completions_total", "Total chat completions", ["model"]
)

TEMPLATES_DIR = Path(__file__).parent / "workflows" / "templates"


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("cleanroom_starting", version="0.1.0")

    await init_db()
    await create_default_admin()

    registry = ConnectorRegistry()
    async with AsyncSessionLocal() as db:
        await registry.load_from_db(db)
    app.state.connector_registry = registry

    engine = WorkflowEngine()
    engine.load_workflows(TEMPLATES_DIR)
    app.state.workflow_engine = engine

    log.info("cleanroom_ready")
    yield
    log.info("cleanroom_stopping")


app = FastAPI(
    title="Cleanroom AI",
    description="On-premise AI platform — all data stays on your network",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(models_router)
app.include_router(workflows_router)
app.include_router(admin_router)
app.include_router(health_router)
app.include_router(audit_router)
app.include_router(tenant_router)
app.include_router(projects_router)
app.include_router(code_router)
app.include_router(prompts_router)
app.include_router(search_router)
app.include_router(insights_router)
app.include_router(control_router)


@app.get("/metrics", include_in_schema=False)
async def metrics():
    return prometheus_client.generate_latest()
