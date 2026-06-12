# Cleanroom AI — On-Premise AI Platform

**Compliance-safe AI that never leaves your network.**

Cleanroom AI gives every employee access to powerful AI — report generation, document analysis, data querying, workflow automation — using your organization's own data, running entirely on your own servers. No data ever leaves the building. No third-party vendor ever touches it.

This is not a cloud AI subscription. It is the infrastructure that makes AI safe to use inside organizations that Microsoft Copilot and similar cloud tools structurally cannot serve: defense contractors, law firms, hospitals, financial institutions, and anyone else for whom the answer to "where does our data go?" must be "nowhere."

---

## Key Features

- **Cleanroom Agent** — delegate whole tasks: the agent plans steps, reads intranet pages, edits workspace files, runs workflows, and reports back with a live task list — like a cloud AI agent, but entirely on-prem
- **Hardware auto-configuration** — on startup the server probes GPU / VRAM / RAM / CPU and automatically serves the best model the box can run, tuned for context size, GPU offload, and keep-alive; admins can override from the dashboard
- **Scheduled tasks** — recurring agent jobs (morning digests, weekly report generation) that run inside your network
- **OpenAI-compatible API** — any tool built for ChatGPT points at your local server instead with no changes
- **Data connectors** — file systems, SQL databases, SharePoint (coming), and REST APIs
- **Pre-built workflow templates** — financial summaries, contract review, meeting summaries, HR policy lookup
- **Role-based access control** — admin, user, and viewer roles with group-based permissions
- **Immutable audit logging** — every AI interaction logged locally; satisfies legal and compliance review
- **Flat annual license** — no per-user pricing; 200 users costs the same as 20
- **Your hardware, your network, your control** — nothing phones home after initial setup

---

## Quick Start

```bash
git clone https://github.com/your-org/cleanroom.git
cd cleanroom
cp .env.example .env

make dev          # build and start the full stack
make pull-model   # download Llama 3.1 8B (~5GB, one time)
```

Or use the installer script on a Linux server:

```bash
bash installer/install.sh
```

**Services:**

| Service    | URL                        | Notes                         |
|------------|----------------------------|-------------------------------|
| Dashboard  | http://localhost:5173      | React UI — chat, reports, admin |
| API docs   | http://localhost:8000/docs | FastAPI Swagger UI            |
| Grafana    | http://localhost:3001      | admin / admin                 |
| Prometheus | http://localhost:9090      |                               |

**Default login:** `admin` / `admin` — change immediately after first login via Admin → Users.

---

## Hardware Requirements

| Deployment | Users  | GPU                    | RAM    | Storage |
|------------|--------|------------------------|--------|---------|
| Small      | < 50   | 1× RTX 3090 or better  | 32 GB  | 100 GB  |
| Medium     | 50–200 | 2× A100 or better      | 64 GB  | 500 GB  |
| Large      | 200+   | 4× A100 or cluster     | 128 GB | 2 TB+   |

**CPU-only:** Works with `llama3.1:8b` at reduced throughput. Adequate for light use and evaluation.

**Operating system:** Ubuntu 22.04 LTS or RHEL 8+ (primary). Windows Server supported via Docker Desktop.

---

## Model Selection

**Automatic (default):** Cleanroom detects your hardware at startup and picks the best model it can serve well — a 4×A100 box gets `llama3.1:70b`, a single RTX 3090 gets `llama3.1:8b` with a 16K context pinned in VRAM, and a CPU-only evaluation host gets a small model with threads tuned to core count. See **Admin → Hardware** in the dashboard to review the detection, pull the recommended model, or override the choice.


| Model           | Size  | Best For                             | VRAM Required |
|-----------------|-------|--------------------------------------|---------------|
| `llama3.1:8b`   | 5 GB  | Default — general use, fast          | 8 GB          |
| `llama3.1:70b`  | 40 GB | Flagship — complex analysis          | 48 GB         |
| `mistral:7b`    | 4 GB  | Document-heavy workloads             | 8 GB          |

Manual override (instead of the dashboard) via `.env`:

```
DEFAULT_MODEL=llama3.1:70b
```

Pull additional models:

```bash
docker compose exec ollama ollama pull mistral:7b
```

---

## Architecture

```
                        Your Network
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   Browser                                                │
  │     │                                                    │
  │     ▼                                                    │
  │   Dashboard (nginx / React)  :5173 / :80                │
  │     │                                                    │
  │     ▼                                                    │
  │   API Server (FastAPI)  :8000                           │
  │     │         │         │         │                      │
  │     ▼         ▼         ▼         ▼                      │
  │  Ollama   PostgreSQL  File    SQL DBs                    │
  │  (LLM)    (state +   System  (connectors)               │
  │  :11434   audit log)                                     │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
           Nothing crosses this boundary
```

---

## Build Phases

| Phase | Status      | Description                                      |
|-------|-------------|--------------------------------------------------|
| 1     | ✅ Current  | Core runtime, OpenAI-compatible API, basic UI    |
| 2     | 🔄 Planned  | Data connectors (filesystem, SQL, SharePoint)    |
| 3     | 🔄 Planned  | Workflow engine with no-code builder             |
| 4     | 🔄 Planned  | Full RBAC, LDAP/AD integration, immutable audit  |
| 5     | 🔄 Planned  | Air-gapped updates, monitoring, backup/recovery  |
| 6     | 🔄 Planned  | Healthcare, Legal, Financial, Government editions|

---

## Compliance

Because the AI runs on your infrastructure, the data residency question has a simple answer: the data never moves. This approach satisfies:

- **HIPAA** — no BAA required; PHI never leaves your servers
- **FINRA / SEC** — customer financial data stays within your controlled environment
- **GDPR / data residency** — no cross-border data transfers
- **CUI / defense contractor** — air-gap compatible; no internet dependency after initial setup

Every AI interaction is logged locally in an append-only audit table. The log records who asked, what they asked, what data was accessed, what the AI responded with, and when — with no gaps.

---

## Running Tests

```bash
make test         # run all server tests
make lint         # ruff linting
make demo         # end-to-end demo (stack must be running)
```

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `make lint` and `make test` before submitting a PR.
3. All new API endpoints must have corresponding tests.
4. Do not add dependencies without discussion — the install footprint matters for air-gapped deployments.

---

## License

Apache 2.0 — see LICENSE file.
