"""The agent loop: plan → act with tools → answer, streaming progress.

Works with any local model served by Ollama — tool calls are requested as a
strict JSON protocol in the assistant text rather than native function
calling, which keeps the loop reliable across llama3.x, mistral, and
quantized models alike.

Event stream (each yielded as a dict, sent to the UI over SSE):
  {"type": "plan",        "steps": [...]}
  {"type": "task_update", "index": 0, "status": "in_progress"|"done"}
  {"type": "tool_call",   "tool": "...", "args_summary": "..."}
  {"type": "tool_result", "tool": "...", "ok": true, "preview": "..."}
  {"type": "answer",      "text": "..."}
  {"type": "files",       "paths": [...]}
  {"type": "error",       "message": "..."}
  {"type": "done"}
"""
from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator
from typing import Any

import httpx
import structlog

from ..hardware import get_model_manager
from ..http import get_ollama_client
from .tools import ToolContext, ToolError, resolve_tool, summarize_args, tools_prompt

log = structlog.get_logger()

MAX_STEPS = 16
MAX_TOOL_RESULT_IN_CONTEXT = 6_000

SYSTEM_PROMPT = """You are Cleanroom Agent, an AI that completes work tasks for employees \
using tools. Everything you do stays inside the organization's network and is audit-logged.

You operate in a strict JSON protocol. EVERY reply must be a single JSON object, nothing else.

First reply — produce a short plan:
{"plan": ["step 1", "step 2", ...]}

Then, on each turn, either call ONE tool:
{"thought": "why", "tool": "tool_name", "args": {...}, "step": <index of plan step you are on>}

Or finish with your answer:
{"thought": "done because ...", "final": "your complete answer in markdown"}

Available tools:
%TOOLS%

Rules:
- One JSON object per reply. No markdown fences, no commentary outside the JSON.
- Keep plans short (2-5 steps).
- Read before you write. Verify results when feasible.
- If a tool fails, adapt or try another approach; do not repeat the identical call.
- When writing documents, produce complete polished content, then mention the file in the final answer.
"""


def _extract_json(text: str) -> dict | None:
    """Best-effort extraction of the first JSON object in the model output."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    # Fast path
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except ValueError:
        pass
    # Scan for balanced braces
    start = text.find("{")
    while start != -1:
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(text)):
            c = text[i]
            if esc:
                esc = False
                continue
            if c == "\\":
                esc = True
            elif c == '"' and not esc:
                in_str = not in_str
            elif not in_str:
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            obj = json.loads(text[start : i + 1])
                            if isinstance(obj, dict):
                                return obj
                        except ValueError:
                            break
        start = text.find("{", start + 1)
    return None


async def _complete(model: str, messages: list[dict]) -> str:
    client = get_ollama_client()
    resp = await client.post(
        "/v1/chat/completions",
        json={"model": model, "messages": messages, "stream": False, "temperature": 0.2},
    )
    resp.raise_for_status()
    data = resp.json()
    return (data.get("choices") or [{}])[0].get("message", {}).get("content", "")


async def run_agent(
    prompt: str,
    ctx: ToolContext,
    model: str | None = None,
    audit: Any = None,  # async callable(action, target, detail) -> None
) -> AsyncGenerator[dict, None]:
    """Execute one agent task, yielding progress events."""
    model = model or get_model_manager().active_model
    system = SYSTEM_PROMPT.replace("%TOOLS%", tools_prompt(ctx.workspace_root is not None))
    messages: list[dict] = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]

    plan: list[str] = []
    current_step = -1
    last_call: tuple[str, str] | None = None

    for turn in range(MAX_STEPS):
        try:
            raw = await _complete(model, messages)
        except httpx.HTTPError as e:
            yield {"type": "error", "message": f"AI runtime error: {e}"}
            yield {"type": "done"}
            return

        obj = _extract_json(raw)
        if obj is None:
            # Model answered in prose — treat it as the final answer.
            yield {"type": "answer", "text": raw.strip()}
            break

        messages.append({"role": "assistant", "content": json.dumps(obj)})

        if "plan" in obj and not plan:
            plan = [str(s) for s in obj.get("plan", [])][:8]
            yield {"type": "plan", "steps": plan}
            messages.append(
                {"role": "user", "content": "Plan accepted. Begin with the first step."}
            )
            continue

        if "final" in obj:
            answer = str(obj.get("final", "")).strip()
            if current_step >= 0:
                yield {"type": "task_update", "index": current_step, "status": "done"}
            for i in range(len(plan)):
                yield {"type": "task_update", "index": i, "status": "done"}
            yield {"type": "answer", "text": answer}
            break

        tool_name = obj.get("tool")
        if not tool_name:
            messages.append(
                {
                    "role": "user",
                    "content": 'Invalid reply. Respond with {"tool": ...} or {"final": ...}.',
                }
            )
            continue

        args = obj.get("args") or {}
        if not isinstance(args, dict):
            args = {}

        # Task-list progress
        step = obj.get("step")
        if isinstance(step, int) and 0 <= step < len(plan) and step != current_step:
            if current_step >= 0:
                yield {"type": "task_update", "index": current_step, "status": "done"}
            current_step = step
            yield {"type": "task_update", "index": step, "status": "in_progress"}

        args_summary = summarize_args(args)
        yield {"type": "tool_call", "tool": tool_name, "args_summary": args_summary}

        # Loop guard: identical call twice in a row
        signature = (tool_name, json.dumps(args, sort_keys=True))
        if signature == last_call:
            messages.append(
                {
                    "role": "user",
                    "content": "You repeated the same tool call. Try something different "
                    "or finish with your best answer.",
                }
            )
            continue
        last_call = signature

        try:
            fn = resolve_tool(ctx, tool_name)
            result = await fn(**args)
            ok = True
        except ToolError as e:
            result = f"Tool error: {e}"
            ok = False
        except TypeError as e:
            result = f"Bad arguments for {tool_name}: {e}"
            ok = False
        except Exception as e:  # noqa: BLE001 — never crash the stream
            log.warning("agent_tool_crash", tool=tool_name, error=str(e))
            result = f"Tool failed unexpectedly: {e}"
            ok = False

        if audit is not None:
            try:
                await audit(tool_name, args_summary, ok)
            except Exception:  # noqa: BLE001
                log.warning("agent_audit_failed", tool=tool_name)

        preview = result[:400] + ("…" if len(result) > 400 else "")
        yield {"type": "tool_result", "tool": tool_name, "ok": ok, "preview": preview}

        messages.append(
            {
                "role": "user",
                "content": f"Tool result ({tool_name}):\n"
                + result[:MAX_TOOL_RESULT_IN_CONTEXT],
            }
        )
    else:
        yield {
            "type": "answer",
            "text": "I reached the step limit before finishing. Here is where I got to — "
            "see the activity log above for details.",
        }

    if ctx.files_written:
        yield {"type": "files", "paths": list(dict.fromkeys(ctx.files_written))}
    yield {"type": "done"}
