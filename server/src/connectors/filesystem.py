from __future__ import annotations

import asyncio
from pathlib import Path

from .base import BaseConnector


class FilesystemConnector(BaseConnector):
    """Reads files from a local directory path."""

    @property
    def connector_type(self) -> str:
        return "filesystem"

    async def connect(self) -> None:
        path = Path(self.config.get("path", ""))
        if not path.exists():
            raise ConnectionError(f"Path does not exist: {path}")

    async def query(self, query_text: str, params: dict) -> list[dict]:
        base_path = Path(self.config.get("path", "."))
        extensions = self.config.get("extensions", [".txt", ".pdf", ".docx", ".md"])
        keyword = query_text.lower()

        results: list[dict] = []

        def _scan() -> list[dict]:
            found: list[dict] = []
            for fp in base_path.rglob("*"):
                if not fp.is_file():
                    continue
                if fp.suffix.lower() not in extensions:
                    continue
                if keyword and keyword not in fp.name.lower():
                    name_match = False
                else:
                    name_match = True

                content = ""
                if fp.suffix.lower() == ".txt" or fp.suffix.lower() == ".md":
                    try:
                        raw = fp.read_text(encoding="utf-8", errors="ignore")
                        if keyword and keyword not in raw.lower() and not name_match:
                            continue
                        content = raw[:2000]
                    except OSError:
                        content = "[unreadable]"
                elif fp.suffix.lower() == ".pdf":
                    try:
                        import pdfplumber  # type: ignore[import]
                        with pdfplumber.open(fp) as pdf:
                            pages = len(pdf.pages)
                            text = " ".join(
                                p.extract_text() or "" for p in pdf.pages[:3]
                            )
                            content = f"[PDF: {pages} pages]\n{text[:1800]}"
                    except Exception:
                        content = f"[PDF: {fp.name}]"
                elif fp.suffix.lower() == ".docx":
                    try:
                        import docx  # type: ignore[import]
                        doc = docx.Document(str(fp))
                        text = "\n".join(p.text for p in doc.paragraphs)
                        content = text[:2000]
                    except Exception:
                        content = f"[DOCX: {fp.name}]"
                else:
                    content = f"[{fp.suffix.upper()}: {fp.name}]"

                found.append({
                    "filename": fp.name,
                    "path": str(fp),
                    "content": content,
                    "size": fp.stat().st_size,
                })
                if len(found) >= 20:
                    break
            return found

        results = await asyncio.to_thread(_scan)
        return results

    async def close(self) -> None:
        pass
