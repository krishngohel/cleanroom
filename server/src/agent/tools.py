"""Agent tools — the verbs the Cleanroom agent can perform.

Cowork-style file tools operate inside a single sandboxed workspace directory
(same path-traversal guard as the Files API). Chrome-style web tools fetch and
read intranet pages server-side; they never leave the network unless the
deployment's own egress rules allow it. Every call is audited by the engine.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable, Coroutine
from urllib.parse import urlparse

import httpx

MAX_FILE_BYTES = 200_000
MAX_RESULT_CHARS = 12_000
MAX_PAGE_CHARS = 20_000


class ToolError(Exception):
    """Raised by a tool to report a user-visible failure (never a crash)."""


# ── Path safety (mirrors api/code.py) ────────────────────────────────────────

def _safe_resolve(root: Path, rel: str) -> Path:
    candidate = (root / rel.lstrip("/\\")).resolve()
    root_resolved = root.resolve()
    if not str(candidate).startswith(str(root_resolved)):
        raise ToolError(f"Path escapes the workspace: {rel}")
    return candidate


# ── HTML → text (stdlib only) ────────────────────────────────────────────────

class _TextExtractor(HTMLParser):
    _SKIP = {"script", "style", "noscript", "template", "svg", "head"}

    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0
        self.title = ""
        self._in_title = False
        self.links: list[tuple[str, str]] = []
        self._link_href: str | None = None
        self._link_text: list[str] = []
        self.forms: list[dict] = []
        self._current_form: dict | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag in self._SKIP:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "a" and a.get("href"):
            self._link_href = a["href"]
            self._link_text = []
        elif tag == "form":
            self._current_form = {
                "action": a.get("action", ""),
                "method": (a.get("method") or "get").lower(),
                "fields": [],
            }
        elif tag in ("input", "select", "textarea") and self._current_form is not None:
            name = a.get("name")
            if name:
                self._current_form["fields"].append(
                    {"name": name, "type": a.get("type", tag), "value": a.get("value", "")}
                )
        elif tag in ("br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "section", "article"):
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag == "a" and self._link_href is not None:
            text = " ".join("".join(self._link_text).split())
            if text:
                self.links.append((text, self._link_href))
            self._link_href = None
        elif tag == "form" and self._current_form is not None:
            self.forms.append(self._current_form)
            self._current_form = None

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
            return
        if self._skip_depth:
            return
        if self._link_href is not None:
            self._link_text.append(data)
        self._chunks.append(data)

    def text(self) -> str:
        raw = "".join(self._chunks)
        lines = [" ".join(line.split()) for line in raw.splitlines()]
        return "\n".join(line for line in lines if line)


def extract_page(html: str) -> dict[str, Any]:
    p = _TextExtractor()
    try:
        p.feed(html)
    except Exception:  # malformed HTML — keep whatever was parsed
        pass
    return {
        "title": p.title.strip(),
        "text": p.text()[:MAX_PAGE_CHARS],
        "links": p.links[:50],
        "forms": p.forms[:10],
    }


def _check_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ToolError("Only http/https URLs are allowed")
    if not parsed.hostname:
        raise ToolError("URL has no host")
    # Block obvious metadata endpoints even on-prem.
    try:
        addr = socket.getaddrinfo(parsed.hostname, None)[0][4][0]
        if ipaddress.ip_address(addr) == ipaddress.ip_address("169.254.169.254"):
            raise ToolError("Blocked metadata endpoint")
    except (socket.gaierror, ValueError):
        pass  # unresolvable now — let httpx surface the real error
    return url


# ── Tool definitions ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    args: dict[str, str]  # arg name → human description
    needs_workspace: bool = False


TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        "list_files",
        "List files and folders in the workspace (optionally under a subpath).",
        {"path": "optional subdirectory, default workspace root"},
        needs_workspace=True,
    ),
    ToolSpec(
        "read_file",
        "Read a text file from the workspace.",
        {"path": "file path relative to workspace root"},
        needs_workspace=True,
    ),
    ToolSpec(
        "write_file",
        "Create or overwrite a text file in the workspace.",
        {"path": "file path relative to workspace root", "content": "full file content"},
        needs_workspace=True,
    ),
    ToolSpec(
        "search_files",
        "Search all workspace text files for a string; returns matching lines.",
        {"query": "text to search for (case-insensitive)"},
        needs_workspace=True,
    ),
    ToolSpec(
        "fetch_page",
        "Open a web page (intranet or internal tool) and return its readable text, "
        "title, links, and any forms found.",
        {"url": "absolute http(s) URL"},
    ),
    ToolSpec(
        "find_in_page",
        "Open a web page and return only the lines matching a query.",
        {"url": "absolute http(s) URL", "query": "text to find (case-insensitive)"},
    ),
    ToolSpec(
        "http_request",
        "Call a REST API endpoint (GET/POST/PUT/DELETE) with an optional JSON body. "
        "Use for submitting forms or querying internal services.",
        {
            "method": "GET, POST, PUT, or DELETE",
            "url": "absolute http(s) URL",
            "json": "optional JSON object to send as the request body",
        },
    ),
    ToolSpec(
        "list_workflows",
        "List the pre-built workflow templates available on this server.",
        {},
    ),
    ToolSpec(
        "run_workflow",
        "Execute a workflow template by id with parameter values.",
        {"workflow_id": "id from list_workflows", "params": "JSON object of parameter values"},
    ),
    ToolSpec(
        "list_connectors",
        "List configured data connectors (databases, file shares).",
        {},
    ),
    ToolSpec(
        "query_connector",
        "Run a query against a configured data connector.",
        {"connector_id": "id from list_connectors", "query": "query text (e.g. SQL)"},
    ),
]


def tools_prompt(workspace_available: bool) -> str:
    """Render the tool list for the system prompt."""
    lines = []
    for t in TOOL_SPECS:
        if t.needs_workspace and not workspace_available:
            continue
        args = ", ".join(f"{k} ({v})" for k, v in t.args.items()) or "no arguments"
        lines.append(f"- {t.name}: {t.description} Args: {args}")
    return "\n".join(lines)


# ── Execution ────────────────────────────────────────────────────────────────

class ToolContext:
    """Everything the tools need, scoped to one agent run."""

    def __init__(
        self,
        workspace_root: Path | None,
        workflow_engine: Any = None,
        connector_registry: Any = None,
        user: Any = None,
        db: Any = None,
    ) -> None:
        self.workspace_root = workspace_root
        self.workflow_engine = workflow_engine
        self.connector_registry = connector_registry
        self.user = user
        self.db = db
        self.files_written: list[str] = []

    def _root(self) -> Path:
        if self.workspace_root is None:
            raise ToolError("No workspace attached to this run — file tools unavailable")
        return self.workspace_root

    # -- files ---------------------------------------------------------------

    async def list_files(self, path: str = "") -> str:
        root = self._root()
        base = _safe_resolve(root, path) if path else root
        if not base.exists():
            raise ToolError(f"Path not found: {path}")
        entries = []
        for p in sorted(base.rglob("*")):
            if any(part.startswith(".") for part in p.parts[len(base.parts):]):
                continue
            rel = p.relative_to(root)
            entries.append(f"{'[dir] ' if p.is_dir() else ''}{rel}")
            if len(entries) >= 400:
                entries.append("… (truncated)")
                break
        return "\n".join(entries) or "(empty)"

    async def read_file(self, path: str) -> str:
        p = _safe_resolve(self._root(), path)
        if not p.is_file():
            raise ToolError(f"Not a file: {path}")
        if p.stat().st_size > MAX_FILE_BYTES:
            raise ToolError(f"File too large to read ({p.stat().st_size} bytes)")
        try:
            return p.read_text(encoding="utf-8")[:MAX_RESULT_CHARS]
        except UnicodeDecodeError:
            raise ToolError("Not a UTF-8 text file")

    async def write_file(self, path: str, content: str) -> str:
        p = _safe_resolve(self._root(), path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        self.files_written.append(path)
        return f"Wrote {len(content)} chars to {path}"

    async def search_files(self, query: str) -> str:
        root = self._root()
        if not query.strip():
            raise ToolError("Empty search query")
        needle = query.lower()
        hits: list[str] = []
        for p in root.rglob("*"):
            if not p.is_file() or p.stat().st_size > MAX_FILE_BYTES:
                continue
            if any(part.startswith(".") for part in p.relative_to(root).parts):
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if needle in line.lower():
                    hits.append(f"{p.relative_to(root)}:{i}: {line.strip()[:200]}")
                    if len(hits) >= 100:
                        return "\n".join(hits) + "\n… (truncated)"
        return "\n".join(hits) or "No matches"

    # -- web -----------------------------------------------------------------

    async def fetch_page(self, url: str) -> str:
        _check_url(url)
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            try:
                resp = await client.get(url)
            except httpx.HTTPError as e:
                raise ToolError(f"Fetch failed: {e}")
        ctype = resp.headers.get("content-type", "")
        if "html" in ctype:
            page = extract_page(resp.text)
            parts = [f"Title: {page['title']}", "", page["text"]]
            if page["links"]:
                parts += ["", "Links:"] + [f"- {t} → {h}" for t, h in page["links"][:25]]
            if page["forms"]:
                parts += ["", f"Forms found: {len(page['forms'])}"]
                for f in page["forms"]:
                    fields = ", ".join(fl["name"] for fl in f["fields"])
                    parts.append(f"- {f['method'].upper()} {f['action']} fields: {fields}")
            return "\n".join(parts)[:MAX_PAGE_CHARS]
        return resp.text[:MAX_PAGE_CHARS]

    async def find_in_page(self, url: str, query: str) -> str:
        text = await self.fetch_page(url)
        needle = query.lower()
        hits = [line for line in text.splitlines() if needle in line.lower()]
        return "\n".join(hits[:60]) or f"'{query}' not found on the page"

    async def http_request(self, method: str, url: str, json: Any = None) -> str:
        method = (method or "GET").upper()
        if method not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            raise ToolError(f"Unsupported method: {method}")
        _check_url(url)
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            try:
                resp = await client.request(method, url, json=json)
            except httpx.HTTPError as e:
                raise ToolError(f"Request failed: {e}")
        body = resp.text[:MAX_RESULT_CHARS]
        return f"HTTP {resp.status_code}\n{body}"

    # -- workflows / connectors ----------------------------------------------

    async def list_workflows(self) -> str:
        if self.workflow_engine is None:
            raise ToolError("Workflow engine unavailable")
        items = self.workflow_engine.list_workflows()
        return "\n".join(f"- {w.get('id')}: {w.get('name', '')}" for w in items) or "None"

    async def run_workflow(self, workflow_id: str, params: dict | None = None) -> str:
        if self.workflow_engine is None:
            raise ToolError("Workflow engine unavailable")
        if self.workflow_engine.get_workflow(workflow_id) is None:
            raise ToolError(f"Unknown workflow: {workflow_id}")
        try:
            result = await self.workflow_engine.execute(
                workflow_id,
                params or {},
                self.user,
                self.db,
                self.connector_registry,
            )
        except ValueError as e:
            raise ToolError(str(e))
        return str(result)[:MAX_RESULT_CHARS]

    async def list_connectors(self) -> str:
        if self.connector_registry is None:
            raise ToolError("Connector registry unavailable")
        items = self.connector_registry.list_connectors()
        return (
            "\n".join(f"- {c.get('id')}: {c.get('type', '')} {c.get('name', '')}" for c in items)
            or "None configured"
        )

    async def query_connector(self, connector_id: str, query: str) -> str:
        if self.connector_registry is None:
            raise ToolError("Connector registry unavailable")
        conn = self.connector_registry.get(connector_id)
        if conn is None:
            raise ToolError(f"Unknown connector: {connector_id}")
        rows = await conn.query(query, {})
        out = "\n".join(str(r) for r in rows[:50])
        return out[:MAX_RESULT_CHARS] or "No rows"


ToolFn = Callable[..., Coroutine[Any, Any, str]]


def resolve_tool(ctx: ToolContext, name: str) -> ToolFn:
    fn = getattr(ctx, name, None)
    valid = {t.name for t in TOOL_SPECS}
    if name not in valid or fn is None:
        raise ToolError(f"Unknown tool: {name}")
    return fn


def summarize_args(args: dict) -> str:
    """Short human-readable arg summary for the activity feed / audit log."""
    parts = []
    for k, v in args.items():
        s = str(v)
        s = re.sub(r"\s+", " ", s)
        parts.append(f"{k}={s[:80]}{'…' if len(s) > 80 else ''}")
    return ", ".join(parts)
