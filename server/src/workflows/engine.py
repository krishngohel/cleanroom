from __future__ import annotations

import time
import uuid
from pathlib import Path

import httpx
import yaml

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import AuditLog, User, WorkflowRun
from ..connectors.registry import ConnectorRegistry

log = structlog.get_logger()


class WorkflowEngine:
    def __init__(self) -> None:
        self._workflows: dict[str, dict] = {}

    def load_workflows(self, templates_dir: Path) -> None:
        self._workflows.clear()
        for yaml_file in templates_dir.glob("*.yaml"):
            try:
                definition = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
                workflow_id = definition.get("id") or yaml_file.stem
                definition["id"] = workflow_id
                self._workflows[workflow_id] = definition
            except Exception as e:
                log.warning("workflow_load_failed", file=str(yaml_file), error=str(e))
        log.info("workflows_loaded", count=len(self._workflows))

    def get_workflow(self, workflow_id: str) -> dict | None:
        return self._workflows.get(workflow_id)

    def list_workflows(self) -> list[dict]:
        return [
            {
                "id": wf["id"],
                "name": wf.get("name", wf["id"]),
                "description": wf.get("description", ""),
                "parameters": wf.get("parameters", []),
            }
            for wf in self._workflows.values()
        ]

    async def execute(
        self,
        workflow_id: str,
        parameters: dict,
        user: User,
        db: AsyncSession,
        registry: ConnectorRegistry,
    ) -> dict:
        workflow = self._workflows.get(workflow_id)
        if workflow is None:
            raise ValueError(f"Workflow '{workflow_id}' not found")

        # Validate required parameters
        for param_def in workflow.get("parameters", []):
            if param_def.get("required") and param_def["name"] not in parameters:
                raise ValueError(f"Missing required parameter: {param_def['name']}")

        # Gather connector data
        connector_data_parts: list[str] = []
        for connector_step in workflow.get("connectors", []):
            connector_id = connector_step.get("connector_id")
            if not connector_id:
                continue
            connector = registry.get(connector_id)
            if connector is None:
                connector_data_parts.append(f"[Connector '{connector_id}' not available]")
                continue
            try:
                query = connector_step.get("query", "")
                query_params = {
                    p: parameters.get(p, "") for p in connector_step.get("params", [])
                }
                rows = await connector.query(query, query_params)
                if rows:
                    connector_data_parts.append(_format_rows(rows))
            except Exception as e:
                connector_data_parts.append(f"[Data retrieval error: {e}]")

        data_section = "\n\n".join(connector_data_parts) if connector_data_parts else ""

        # Build prompt
        template: str = workflow.get("prompt_template", "{data}")
        prompt = template
        for key, value in parameters.items():
            prompt = prompt.replace(f"{{{key}}}", str(value))
        prompt = prompt.replace("{data}", data_section)

        model = workflow.get("model") or settings.default_model

        # Call Ollama
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/v1/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                },
            )
            resp.raise_for_status()

        duration_ms = int((time.monotonic() - start) * 1000)
        response_text = resp.json()["choices"][0]["message"]["content"]

        # Persist run
        run = WorkflowRun(
            id=str(uuid.uuid4()),
            user_id=user.id,
            workflow_id=workflow_id,
            parameters=parameters,
            response=response_text,
            model_used=model,
            duration_ms=duration_ms,
        )
        db.add(run)
        db.add(
            AuditLog(
                user_id=user.id,
                username=user.username,
                action="workflow_run",
                resource_type="workflow",
                resource_id=workflow_id,
                details={"duration_ms": duration_ms, "model": model},
            )
        )
        await db.commit()

        return {
            "run_id": run.id,
            "workflow_id": workflow_id,
            "response": response_text,
            "model": model,
            "duration_ms": duration_ms,
        }


def _format_rows(rows: list[dict]) -> str:
    if not rows:
        return ""
    headers = list(rows[0].keys())
    lines = [" | ".join(headers), "-" * (len(" | ".join(headers)))]
    for row in rows[:100]:
        lines.append(" | ".join(str(row.get(h, "")) for h in headers))
    if len(rows) > 100:
        lines.append(f"... ({len(rows) - 100} more rows)")
    return "\n".join(lines)
