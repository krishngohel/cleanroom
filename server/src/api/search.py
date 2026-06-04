from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import Project, ProjectFile, User, get_db

router = APIRouter(tags=["search"])

MAX_HITS = 50
SNIPPET_CHARS = 140


def _make_snippets(content: str, term_lower: str, limit: int = 3) -> list[dict]:
    """Find up to `limit` case-insensitive matches and return surrounding snippets."""
    hits: list[dict] = []
    lower = content.lower()
    start = 0
    while len(hits) < limit:
        idx = lower.find(term_lower, start)
        if idx < 0:
            break
        before = content[max(0, idx - SNIPPET_CHARS // 2): idx]
        after = content[idx + len(term_lower): idx + len(term_lower) + SNIPPET_CHARS // 2]
        # Line number for context
        line_no = content.count("\n", 0, idx) + 1
        hits.append({
            "line": line_no,
            "before": before.lstrip(),
            "match": content[idx: idx + len(term_lower)],
            "after": after.rstrip(),
        })
        start = idx + len(term_lower)
    return hits


@router.get("/projects/{project_id}/search")
async def search_project(
    project_id: str,
    q: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Plain text search across all files in a project."""
    term = q.strip()
    if len(term) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Query must be at least 2 characters")

    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if not project.is_shared and project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Project not accessible")

    files = (
        await db.execute(
            select(ProjectFile).where(ProjectFile.project_id == project_id)
        )
    ).scalars().all()

    term_lower = term.lower()
    results: list[dict] = []
    total_hits = 0
    for f in files:
        snippets = _make_snippets(f.content, term_lower, limit=5)
        if not snippets:
            continue
        full_count = f.content.lower().count(term_lower)
        total_hits += full_count
        results.append({
            "file_id": f.id,
            "filename": f.filename,
            "match_count": full_count,
            "snippets": snippets,
        })
        if total_hits >= MAX_HITS:
            break

    # Rank by match count
    results.sort(key=lambda r: r["match_count"], reverse=True)

    return {
        "query": term,
        "file_count": len(results),
        "total_matches": total_hits,
        "files": results,
    }
