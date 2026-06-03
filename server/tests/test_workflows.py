from __future__ import annotations

from httpx import AsyncClient


async def test_list_workflows(client: AsyncClient, admin_token: str):
    resp = await client.get("/workflows", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    workflows = resp.json()
    assert isinstance(workflows, list)
    ids = [w["id"] for w in workflows]
    assert "financial_summary" in ids
    assert "contract_review" in ids


async def test_get_workflow(client: AsyncClient, admin_token: str):
    resp = await client.get("/workflows/financial_summary", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    wf = resp.json()
    assert wf["id"] == "financial_summary"
    assert "parameters" in wf


async def test_get_nonexistent_workflow(client: AsyncClient, admin_token: str):
    resp = await client.get("/workflows/does_not_exist", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


async def test_list_workflow_runs_empty(client: AsyncClient, user_token: str):
    resp = await client.get("/workflow-runs", headers={"Authorization": f"Bearer {user_token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_workflow_runs_requires_auth(client: AsyncClient):
    resp = await client.get("/workflow-runs")
    assert resp.status_code == 401


async def test_get_workflow_run_not_found(client: AsyncClient, user_token: str):
    resp = await client.get(
        "/workflow-runs/nonexistent-run-id",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 404
