"""
End-to-end integration test for the Cleanroom AI API.
Verifies auth, chat proxying, workflow listing, and audit logging work together.
Requires the full stack (Ollama + PostgreSQL) — skip in unit test CI.
"""
from __future__ import annotations

import pytest


@pytest.mark.skip(reason="Requires live Ollama instance — run manually against full stack")
async def test_full_stack_chat_flow(client, admin_token):
    """Login → chat → verify audit log captures the event."""
    resp = await client.post(
        "/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": "Say hello in one word."}],
            "stream": False,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"]

    audit_resp = await client.get(
        "/audit/logs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert audit_resp.status_code == 200
    actions = [log["action"] for log in audit_resp.json()["logs"]]
    assert "chat_completion" in actions


@pytest.mark.skip(reason="Requires live Ollama instance — run manually against full stack")
async def test_workflow_execution(client, admin_token):
    """Run the financial_summary workflow end-to-end."""
    resp = await client.post(
        "/workflows/financial_summary/run",
        json={"parameters": {"period": "Q1 2024", "department": "Engineering"}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["workflow_id"] == "financial_summary"
    assert len(result["response"]) > 50
    assert result["duration_ms"] > 0
