"""Code workspace API — Claude Code-style sandboxed file ops + AI edits.

All file operations resolve paths under the workspace root. Anything that
escapes the root (via `..`, absolute paths, or symlinks) is rejected at the
sandbox boundary.

Only UTF-8 text files are supported. Binary, hidden (`.git/`), or huge files
(> 1 MB) are filtered from listings.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_role
from ..config import settings
from ..database import AuditLog, User, Workspace, get_db

router = APIRouter(prefix="/code", tags=["code"])

MAX_FILE_BYTES = 1_000_000
HIDDEN_PREFIXES = (".git", ".venv", "node_modules", "__pycache__", ".idea", ".vscode", "dist", "build", ".next")
TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".rst", ".csv", ".tsv", ".json", ".yaml", ".yml",
    ".toml", ".ini", ".cfg", ".env", ".log", ".xml", ".html", ".htm", ".css",
    ".scss", ".less", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue",
    ".svelte", ".py", ".pyi", ".pyx", ".rb", ".php", ".pl", ".lua", ".sh",
    ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd", ".sql", ".graphql",
    ".gql", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".cc",
    ".h", ".hpp", ".hh", ".m", ".mm", ".cs", ".fs", ".fsx", ".vb", ".lisp",
    ".clj", ".cljs", ".elm", ".ex", ".exs", ".erl", ".hs", ".scala", ".dart",
    ".tf", ".dockerfile", ".gitignore", ".editorconfig", ".prettierrc",
    ".eslintrc",
}


def _is_text_file(p: Path) -> bool:
    if p.name in {"Dockerfile", "Makefile", "Procfile"}:
        return True
    return p.suffix.lower() in TEXT_EXTENSIONS


def _safe_resolve(root: Path, rel: str) -> Path:
    """Resolve `rel` under `root` and refuse anything that escapes.

    Backslashes are normalized to forward slashes before resolution so that
    Windows-style attack strings (e.g. `..\\..\\windows\\system32`) are caught
    on Linux too — otherwise the server would treat them as a single
    unusual filename instead of a path traversal attempt.
    """
    rel = rel.replace("\\", "/").lstrip("/")
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path escapes workspace root")
    return candidate


# ── Pydantic models ──────────────────────────────────────────────────────────


class CreateWorkspaceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    root_path: str
    is_shared: bool = True
    is_writable: bool = True


class CreatePersonalWorkspaceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    is_shared: bool = False  # Personal by default


class UpdateWorkspaceRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    is_shared: bool | None = None
    is_writable: bool | None = None


class WriteFileRequest(BaseModel):
    path: str
    content: str


class CreateDirRequest(BaseModel):
    path: str


class ProposeEditRequest(BaseModel):
    path: str
    instruction: str
    model: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _serialize(ws: Workspace) -> dict[str, Any]:
    return {
        "id": ws.id,
        "name": ws.name,
        "description": ws.description,
        "root_path": ws.root_path,
        "owner_id": ws.owner_id,
        "is_shared": ws.is_shared,
        "is_writable": ws.is_writable,
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
        "updated_at": ws.updated_at.isoformat() if ws.updated_at else None,
    }


async def _get_or_403(db: AsyncSession, workspace_id: str, user: User) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    if not ws.is_shared and ws.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace not accessible")
    return ws


def _list_tree(root: Path, max_entries: int = 2000) -> list[dict]:
    """Return a flat list of {path, type, size} under root, filtered."""
    out: list[dict] = []
    if not root.exists() or not root.is_dir():
        return out
    root_resolved = root.resolve()
    for dirpath, dirnames, filenames in os.walk(root_resolved):
        # Prune hidden / vendor dirs in-place so os.walk skips them
        dirnames[:] = [d for d in dirnames if d not in HIDDEN_PREFIXES and not d.startswith(".")]
        for d in dirnames:
            p = Path(dirpath) / d
            rel = p.relative_to(root_resolved).as_posix()
            out.append({"path": rel, "type": "dir"})
            if len(out) >= max_entries:
                return out
        for f in filenames:
            if f.startswith("."):
                # Allow common dotfiles
                if f not in {".env", ".env.example", ".gitignore", ".editorconfig"}:
                    continue
            p = Path(dirpath) / f
            try:
                size = p.stat().st_size
            except OSError:
                continue
            if size > MAX_FILE_BYTES:
                continue
            if not _is_text_file(p):
                continue
            rel = p.relative_to(root_resolved).as_posix()
            out.append({"path": rel, "type": "file", "size": size})
            if len(out) >= max_entries:
                return out
    out.sort(key=lambda e: (e["type"] == "file", e["path"]))
    return out


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/workspaces")
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Workspace).where(
        (Workspace.owner_id == user.id) | (Workspace.is_shared == True)  # noqa: E712
    )
    result = await db.execute(q.order_by(Workspace.updated_at.desc()))
    return [_serialize(w) for w in result.scalars().all()]


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", s).strip("-").lower()
    return s[:60] or "workspace"


@router.post("/workspaces/personal", status_code=status.HTTP_201_CREATED)
async def create_personal_workspace(
    request: Request,
    body: CreatePersonalWorkspaceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a workspace whose root is a tenant-managed uploads directory.

    Non-admins can call this. The path is auto-generated under `uploads_dir`
    so users never have to think about server paths.
    """
    base = Path(settings.uploads_dir).resolve()
    base.mkdir(parents=True, exist_ok=True)

    slug = _slugify(body.name)
    user_dir = base / _slugify(user.username)
    user_dir.mkdir(parents=True, exist_ok=True)

    target = user_dir / slug
    suffix = 2
    while target.exists():
        target = user_dir / f"{slug}-{suffix}"
        suffix += 1
    target.mkdir(parents=True, exist_ok=False)

    ws = Workspace(
        name=body.name,
        description=body.description,
        root_path=str(target),
        owner_id=user.id,
        is_shared=body.is_shared,
        is_writable=True,
    )
    db.add(ws)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="create_personal_workspace",
            resource_type="workspace",
            resource_id=body.name,
            details={"root_path": str(target)},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(ws)
    return _serialize(ws)


@router.post("/workspaces", status_code=status.HTTP_201_CREATED)
async def create_workspace(
    request: Request,
    body: CreateWorkspaceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    root = Path(body.root_path).resolve()
    if not root.exists():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "root_path does not exist")
    if not root.is_dir():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "root_path is not a directory")

    ws = Workspace(
        name=body.name,
        description=body.description,
        root_path=str(root),
        owner_id=user.id,
        is_shared=body.is_shared,
        is_writable=body.is_writable,
    )
    db.add(ws)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="create_workspace",
            resource_type="workspace",
            resource_id=body.name,
            details={"root_path": str(root)},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(ws)
    return _serialize(ws)


@router.get("/workspaces/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    return _serialize(ws)


@router.patch("/workspaces/{workspace_id}")
async def update_workspace(
    workspace_id: str,
    request: Request,
    body: UpdateWorkspaceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    if ws.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or an admin can edit")
    data = body.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(ws, k, v)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="update_workspace",
            resource_type="workspace",
            resource_id=ws.name,
            details=data,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(ws)
    return _serialize(ws)


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    if ws.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or an admin can delete")
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="delete_workspace",
            resource_type="workspace",
            resource_id=ws.name,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.delete(ws)
    await db.commit()


@router.get("/workspaces/{workspace_id}/tree")
async def list_files(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    entries = _list_tree(Path(ws.root_path))
    return {"entries": entries}


@router.get("/workspaces/{workspace_id}/file")
async def read_file(
    workspace_id: str,
    path: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    resolved = _safe_resolve(Path(ws.root_path), path)
    if not resolved.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    if resolved.is_dir():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path is a directory")
    if resolved.stat().st_size > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large")
    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a UTF-8 text file")
    return {
        "path": path,
        "content": content,
        "size_bytes": len(content.encode("utf-8")),
    }


@router.put("/workspaces/{workspace_id}/file")
async def write_file(
    workspace_id: str,
    request: Request,
    body: WriteFileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    if not ws.is_writable:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace is read-only")
    if user.role == "viewer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Viewer role cannot edit files")
    if len(body.content.encode("utf-8")) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large")
    resolved = _safe_resolve(Path(ws.root_path), body.path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(body.content, encoding="utf-8")
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="write_file",
            resource_type="workspace_file",
            resource_id=f"{ws.name}/{body.path}",
            details={"size_bytes": len(body.content.encode("utf-8"))},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"path": body.path, "size_bytes": len(body.content.encode("utf-8"))}


@router.delete("/workspaces/{workspace_id}/file", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    workspace_id: str,
    path: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    if not ws.is_writable:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace is read-only")
    if user.role == "viewer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Viewer role cannot delete files")
    resolved = _safe_resolve(Path(ws.root_path), path)
    if not resolved.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    if resolved.is_dir():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Refusing to delete a directory")
    resolved.unlink()
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="delete_file",
            resource_type="workspace_file",
            resource_id=f"{ws.name}/{path}",
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()


@router.post("/workspaces/{workspace_id}/dir", status_code=status.HTTP_201_CREATED)
async def create_dir(
    workspace_id: str,
    request: Request,
    body: CreateDirRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await _get_or_403(db, workspace_id, user)
    if not ws.is_writable:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace is read-only")
    if user.role == "viewer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Viewer role cannot create folders")
    resolved = _safe_resolve(Path(ws.root_path), body.path)
    if resolved.exists():
        if resolved.is_dir():
            return {"path": body.path, "created": False}
        raise HTTPException(status.HTTP_409_CONFLICT, "A file already exists at that path")
    resolved.mkdir(parents=True, exist_ok=True)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="create_dir",
            resource_type="workspace_file",
            resource_id=f"{ws.name}/{body.path}",
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return {"path": body.path, "created": True}


@router.post("/workspaces/{workspace_id}/propose")
async def propose_edit(
    workspace_id: str,
    request: Request,
    body: ProposeEditRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ask the LLM to rewrite a file. Returns proposed content; caller decides to apply."""
    ws = await _get_or_403(db, workspace_id, user)
    resolved = _safe_resolve(Path(ws.root_path), body.path)

    if resolved.exists() and resolved.is_file():
        try:
            current = resolved.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a UTF-8 text file")
    else:
        current = ""

    from ..hardware import get_model_manager

    model = body.model or get_model_manager().active_model

    system_prompt = (
        "You are a precision code editor. Apply the user's instruction to the file and "
        "return ONLY the full new file content. Do not include explanations, markdown "
        "code fences, or surrounding commentary — only the raw file contents to write. "
        "Preserve existing indentation style, line endings, and trailing newline."
    )

    user_prompt = (
        f"File: {body.path}\n\n"
        f"Current content:\n---BEGIN FILE---\n{current}\n---END FILE---\n\n"
        f"Instruction: {body.instruction}\n\n"
        "Return only the new file content."
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
    }

    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="propose_edit",
            resource_type="workspace_file",
            resource_id=f"{ws.name}/{body.path}",
            details={"instruction_chars": len(body.instruction), "current_chars": len(current)},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(f"{settings.ollama_base_url}/v1/chat/completions", json=payload)
            resp.raise_for_status()
    except httpx.ConnectError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI runtime is unavailable. Ensure Ollama is running.",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))

    data = resp.json()
    proposed = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")

    # Strip accidental code fences if the model included them.
    if proposed.startswith("```"):
        lines = proposed.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        proposed = "\n".join(lines)

    return {
        "path": body.path,
        "current_content": current,
        "proposed_content": proposed,
        "model": model,
    }
