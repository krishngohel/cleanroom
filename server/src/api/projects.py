from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import AuditLog, Project, ProjectFile, User, get_db

router = APIRouter(prefix="/projects", tags=["projects"])

MAX_FILE_BYTES = 2_000_000  # 2 MB
MAX_FILES_PER_PROJECT = 50


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    system_prompt: str = ""
    default_model: str | None = None
    color: str = "#38bdf8"
    icon: str = "✨"
    is_shared: bool = True


class UpdateProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    system_prompt: str | None = None
    default_model: str | None = None
    color: str | None = None
    icon: str | None = None
    is_shared: bool | None = None


def _serialize_project(p: Project, file_count: int = 0, total_bytes: int = 0) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "system_prompt": p.system_prompt,
        "default_model": p.default_model,
        "color": p.color,
        "icon": p.icon,
        "owner_id": p.owner_id,
        "is_shared": p.is_shared,
        "file_count": file_count,
        "total_bytes": total_bytes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _serialize_file(f: ProjectFile) -> dict:
    return {
        "id": f.id,
        "project_id": f.project_id,
        "filename": f.filename,
        "size_bytes": f.size_bytes,
        "uploaded_by": f.uploaded_by,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


async def _accessible_projects_query(user: User):
    """Projects visible to the user: their own + shared."""
    return select(Project).where((Project.owner_id == user.id) | (Project.is_shared == True))  # noqa: E712


async def _get_or_403(db: AsyncSession, project_id: str, user: User) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if not project.is_shared and project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Project not accessible")
    return project


@router.get("")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = await _accessible_projects_query(user)
    result = await db.execute(q.order_by(Project.updated_at.desc()))
    projects = result.scalars().all()
    # Per-project file count + size (single grouped query)
    counts_q = (
        select(
            ProjectFile.project_id,
            func.count(ProjectFile.id),
            func.coalesce(func.sum(ProjectFile.size_bytes), 0),
        )
        .where(ProjectFile.project_id.in_([p.id for p in projects]) if projects else False)
        .group_by(ProjectFile.project_id)
    )
    counts_rows = (await db.execute(counts_q)).all() if projects else []
    counts = {row[0]: (row[1], row[2]) for row in counts_rows}
    return [
        _serialize_project(p, *(counts.get(p.id, (0, 0)))) for p in projects
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    request: Request,
    body: CreateProjectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = Project(
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        default_model=body.default_model,
        color=body.color,
        icon=body.icon,
        owner_id=user.id,
        is_shared=body.is_shared,
    )
    db.add(project)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="create_project",
            resource_type="project",
            resource_id=body.name,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(project)
    return _serialize_project(project)


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _get_or_403(db, project_id, user)
    files_result = await db.execute(
        select(ProjectFile)
        .where(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.created_at)
    )
    files = files_result.scalars().all()
    total = sum(f.size_bytes for f in files)
    payload = _serialize_project(project, len(files), total)
    payload["files"] = [_serialize_file(f) for f in files]
    return payload


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    request: Request,
    body: UpdateProjectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _get_or_403(db, project_id, user)
    if project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or an admin can edit")
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")
    for k, v in data.items():
        setattr(project, k, v)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="update_project",
            resource_type="project",
            resource_id=project.name,
            details=data,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(project)
    return _serialize_project(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _get_or_403(db, project_id, user)
    if project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or an admin can delete")
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="delete_project",
            resource_type="project",
            resource_id=project.name,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.delete(project)
    await db.commit()


@router.post("/{project_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: str,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _get_or_403(db, project_id, user)
    count_result = await db.execute(
        select(func.count(ProjectFile.id)).where(ProjectFile.project_id == project_id)
    )
    if count_result.scalar_one() >= MAX_FILES_PER_PROJECT:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Project file limit ({MAX_FILES_PER_PROJECT}) reached",
        )

    blob = await file.read()
    if len(blob) > MAX_FILE_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File too large; max {MAX_FILE_BYTES // 1024} KB",
        )
    try:
        content = blob.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Only UTF-8 text files are supported (csv, md, txt, json, code, etc.)",
        )

    pf = ProjectFile(
        project_id=project.id,
        filename=file.filename or "untitled",
        content=content,
        size_bytes=len(blob),
        uploaded_by=user.id,
    )
    db.add(pf)
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="upload_project_file",
            resource_type="project_file",
            resource_id=f"{project.name}/{pf.filename}",
            details={"size_bytes": len(blob)},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(pf)
    return _serialize_file(pf)


@router.delete("/{project_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    project_id: str,
    file_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _get_or_403(db, project_id, user)
    if project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or an admin can delete files")
    result = await db.execute(
        select(ProjectFile).where(
            ProjectFile.id == file_id, ProjectFile.project_id == project_id
        )
    )
    pf = result.scalar_one_or_none()
    if pf is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="delete_project_file",
            resource_type="project_file",
            resource_id=f"{project.name}/{pf.filename}",
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.delete(pf)
    await db.commit()
