"""Tests for hardware auto-configuration, the agent engine, and scheduled tasks."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from httpx import AsyncClient

from src.agent.engine import _extract_json
from src.agent.tools import ToolContext, ToolError, extract_page
from src.hardware import (
    GPUInfo,
    HardwareProfile,
    recommend_model,
)


# ── Recommendation logic ──────────────────────────────────────────────────────

def _hw(vram: float = 0, ram: float = 16, cores: int = 8) -> HardwareProfile:
    gpus = [GPUInfo(name="Test GPU", vram_gb=vram)] if vram else []
    return HardwareProfile(
        gpus=gpus,
        total_vram_gb=vram,
        ram_gb=ram,
        cpu_cores=cores,
        cpu_model="test",
        os_name="test",
    )


def test_recommend_flagship_on_big_gpu():
    rec = recommend_model(_hw(vram=80, ram=128))
    assert rec.model.id == "llama3.1:70b"
    assert rec.mode == "gpu"


def test_recommend_default_on_consumer_gpu():
    rec = recommend_model(_hw(vram=24, ram=64))  # e.g. RTX 3090/4090
    assert rec.model.id == "llama3.1:8b"
    assert rec.mode == "gpu"
    # plenty of headroom → big context and pinned in VRAM
    assert rec.options["num_ctx"] == 16384
    assert rec.options["keep_alive"] == "-1"


def test_recommend_small_model_on_small_gpu():
    rec = recommend_model(_hw(vram=6, ram=16))
    assert rec.model.id == "llama3.2:3b"
    assert rec.mode == "gpu"


def test_recommend_cpu_fallback():
    rec = recommend_model(_hw(vram=0, ram=32, cores=16))
    assert rec.mode == "cpu"
    assert rec.model.id == "llama3.1:8b"
    assert rec.options["num_thread"] == 15


def test_recommend_tiny_host():
    rec = recommend_model(_hw(vram=0, ram=2, cores=2))
    assert rec.model.id == "llama3.2:1b"


# ── Hardware API ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hardware_requires_auth(client: AsyncClient):
    resp = await client.get("/v1/hardware")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_hardware_status(client: AsyncClient, user_token: str):
    resp = await client.get(
        "/v1/hardware", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["active_model"]
    assert data["recommendation"] is not None
    assert isinstance(data["catalog"], list) and len(data["catalog"]) >= 3


@pytest.mark.asyncio
async def test_model_override_admin_only(client: AsyncClient, user_token: str):
    resp = await client.post(
        "/v1/hardware/model",
        json={"model": "llama3.1:8b"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_model_override_and_reset(client: AsyncClient, admin_token: str):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/v1/hardware/model", json={"model": "llama3.1:8b"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["active_model"] == "llama3.1:8b"

    resp = await client.post("/v1/hardware/model", json={"model": "auto"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["override"] is None


@pytest.mark.asyncio
async def test_model_override_rejects_unknown(client: AsyncClient, admin_token: str):
    resp = await client.post(
        "/v1/hardware/model",
        json={"model": "totally-made-up:99b"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


# ── Agent JSON protocol parsing ───────────────────────────────────────────────

def test_extract_json_plain():
    assert _extract_json('{"plan": ["a", "b"]}') == {"plan": ["a", "b"]}


def test_extract_json_with_fences():
    assert _extract_json('```json\n{"final": "done"}\n```') == {"final": "done"}


def test_extract_json_with_prose():
    out = _extract_json('Sure! Here is my reply: {"tool": "read_file", "args": {"path": "a.txt"}} hope that helps')
    assert out == {"tool": "read_file", "args": {"path": "a.txt"}}


def test_extract_json_nested_and_strings():
    raw = '{"thought": "has } brace in string", "tool": "x", "args": {"q": "{nested}"}}'
    assert _extract_json(raw)["args"]["q"] == "{nested}"


def test_extract_json_garbage():
    assert _extract_json("no json here at all") is None


# ── Agent tools ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tools_path_escape_rejected(tmp_path: Path):
    ctx = ToolContext(workspace_root=tmp_path)
    with pytest.raises(ToolError):
        await ctx.read_file("../../etc/passwd")


@pytest.mark.asyncio
async def test_tools_write_read_search(tmp_path: Path):
    ctx = ToolContext(workspace_root=tmp_path)
    await ctx.write_file("notes/hello.txt", "the secret word is xyzzy\nsecond line")
    assert "xyzzy" in await ctx.read_file("notes/hello.txt")
    hits = await ctx.search_files("XYZZY")
    assert "hello.txt" in hits
    listing = await ctx.list_files()
    assert "notes" in listing
    assert ctx.files_written == ["notes/hello.txt"]


@pytest.mark.asyncio
async def test_tools_no_workspace(tmp_path: Path):
    ctx = ToolContext(workspace_root=None)
    with pytest.raises(ToolError):
        await ctx.list_files()


def test_extract_page_text_links_forms():
    html = """
    <html><head><title>HR Portal</title><script>ignored()</script></head>
    <body><h1>Vacation Policy</h1><p>New hires get 15 days.</p>
    <a href="/policy">Full policy</a>
    <form action="/request" method="post"><input name="days" /><input name="reason" /></form>
    </body></html>
    """
    page = extract_page(html)
    assert page["title"] == "HR Portal"
    assert "15 days" in page["text"]
    assert "ignored()" not in page["text"]
    assert ("Full policy", "/policy") in page["links"]
    assert page["forms"][0]["fields"][0]["name"] == "days"


# ── Agent API ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_agent_run_requires_auth(client: AsyncClient):
    resp = await client.post("/v1/agent/run", json={"prompt": "hello"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agent_run_streams_error_without_runtime(client: AsyncClient, user_token: str):
    """Without Ollama running, the agent should stream a clean error + done."""
    events = []
    async with client.stream(
        "POST",
        "/v1/agent/run",
        json={"prompt": "test task"},
        headers={"Authorization": f"Bearer {user_token}"},
    ) as resp:
        assert resp.status_code == 200
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    types = [e["type"] for e in events]
    assert types[0] == "run"
    assert "done" in types
    assert any(t in ("error", "answer") for t in types)


@pytest.mark.asyncio
async def test_agent_runs_listing(client: AsyncClient, user_token: str):
    resp = await client.get(
        "/v1/agent/runs", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp.status_code == 200
    runs = resp.json()
    assert isinstance(runs, list)


# ── Scheduled tasks API ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_scheduled_task_crud(client: AsyncClient, user_token: str):
    h = {"Authorization": f"Bearer {user_token}"}
    created = await client.post(
        "/v1/scheduled-tasks",
        json={
            "name": "Morning digest",
            "prompt": "Summarize yesterday's reports",
            "schedule_kind": "daily",
            "daily_time": "08:30",
            "interval_minutes": 1440,
            "enabled": True,
        },
        headers=h,
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["daily_time"] == "08:30"

    listed = await client.get("/v1/scheduled-tasks", headers=h)
    assert any(t["id"] == task["id"] for t in listed.json())

    updated = await client.patch(
        f"/v1/scheduled-tasks/{task['id']}",
        json={
            "name": "Morning digest",
            "prompt": "Summarize yesterday's reports",
            "schedule_kind": "interval",
            "daily_time": "08:30",
            "interval_minutes": 60,
            "enabled": False,
        },
        headers=h,
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False

    deleted = await client.delete(f"/v1/scheduled-tasks/{task['id']}", headers=h)
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_scheduled_task_validation(client: AsyncClient, user_token: str):
    resp = await client.post(
        "/v1/scheduled-tasks",
        json={"name": "", "prompt": "x"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 422
