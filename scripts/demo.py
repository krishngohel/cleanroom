#!/usr/bin/env python3
"""
Cleanroom AI — End-to-end demo script.
Demonstrates login, model listing, chat, and workflow execution.

Usage:
    python scripts/demo.py [--base-url http://localhost:8000]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import urllib.error
from typing import Any


def request(base_url: str, method: str, path: str, *, body: dict | None = None, token: str | None = None, form: str | None = None) -> Any:
    url = f"{base_url}{path}"
    headers: dict[str, str] = {}

    if token:
        headers["Authorization"] = f"Bearer {token}"

    if form is not None:
        data = form.encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    else:
        data = None

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        print(f"  HTTP {e.code}: {body_text}", file=sys.stderr)
        raise


def hr(char: str = "─", width: int = 60) -> None:
    print(char * width)


def section(title: str) -> None:
    print()
    hr("═")
    print(f"  {title}")
    hr("═")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanroom AI demo")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="admin")
    args = parser.parse_args()

    base = args.base_url

    print()
    print("  Cleanroom AI — Demo")
    hr()
    print(f"  Target: {base}")

    # ── 1. Health check ───────────────────────────────────────────────────────
    section("1. Health Check")
    health = request(base, "GET", "/health")
    print(f"  Status:  {health['status']}")
    print(f"  Version: {health['version']}")

    # ── 2. Login ─────────────────────────────────────────────────────────────
    section("2. Authentication")
    auth = request(base, "POST", "/auth/login", form=f"username={args.username}&password={args.password}")
    token = auth["access_token"]
    user = auth["user"]
    print(f"  Logged in as: {user['username']} (role: {user['role']})")

    # ── 3. System status ─────────────────────────────────────────────────────
    section("3. System Status")
    status = request(base, "GET", "/status", token=token)
    print(f"  Overall:   {status['status']}")
    print(f"  Ollama:    {'connected' if status['ollama']['connected'] else 'offline'}")
    print(f"  Models:    {', '.join(status['ollama']['models']) or 'none pulled yet'}")
    print(f"  Connectors: {status['connectors']['active']} active / {status['connectors']['total']} total")

    # ── 4. List models ───────────────────────────────────────────────────────
    section("4. Available Models")
    models_resp = request(base, "GET", "/v1/models", token=token)
    models = models_resp.get("data", [])
    if models:
        for m in models:
            print(f"  - {m['id']}")
    else:
        print("  No models found. Run 'make pull-model' to download llama3.1:8b.")
        print("  Skipping chat and workflow demos.")
        print()
        sys.exit(0)

    default_model = models[0]["id"]

    # ── 5. Chat ───────────────────────────────────────────────────────────────
    section("5. Chat Completion")
    prompt = "In two sentences, explain why on-premise AI is valuable for regulated industries."
    print(f"  Prompt: {prompt}")
    print()
    chat_resp = request(
        base,
        "POST",
        "/v1/chat/completions",
        body={"model": default_model, "messages": [{"role": "user", "content": prompt}], "stream": False},
        token=token,
    )
    response_text = chat_resp["choices"][0]["message"]["content"]
    print(f"  Response:\n  {response_text}")

    # ── 6. Workflows ──────────────────────────────────────────────────────────
    section("6. Available Workflows")
    workflows = request(base, "GET", "/workflows", token=token)
    for wf in workflows:
        print(f"  - {wf['id']}: {wf['name']}")

    # ── 7. Run a workflow ─────────────────────────────────────────────────────
    section("7. Run: meeting_summary workflow")
    sample_transcript = """
    Attendees: Sarah (Product), James (Engineering), Maria (Sales)
    - Sarah: We need to finalize the Q2 roadmap by end of next week.
    - James: The API refactor is 80% done, needs 3 more days.
    - Maria: Two enterprise prospects want a demo before month end.
    - Decision: James will finish API work by Thursday, Sarah will schedule demos for Friday.
    - Open: Budget approval for new server hardware still pending from finance.
    """
    result = request(
        base,
        "POST",
        "/workflows/meeting_summary/run",
        body={"parameters": {
            "meeting_title": "Q2 Planning Sync",
            "meeting_date": "2026-05-02",
            "transcript": sample_transcript.strip(),
        }},
        token=token,
    )
    print(f"  Generated in {result['duration_ms']}ms using {result['model']}")
    print()
    hr()
    print(result["response"])
    hr()

    print()
    print("  Demo complete.")
    print()


if __name__ == "__main__":
    main()
