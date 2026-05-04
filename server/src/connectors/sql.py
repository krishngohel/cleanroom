from __future__ import annotations

import asyncio
import re

from .base import BaseConnector

_SELECT_RE = re.compile(r"^\s*SELECT\b", re.IGNORECASE)


class SQLConnector(BaseConnector):
    """Executes read-only SELECT queries against a SQL database."""

    @property
    def connector_type(self) -> str:
        return "sql"

    async def connect(self) -> None:
        conn_str = self.config.get("connection_string", "")
        if not conn_str:
            raise ConnectionError("connection_string is required")

    async def query(self, query_text: str, params: dict) -> list[dict]:
        if not _SELECT_RE.match(query_text):
            raise ValueError("Only SELECT statements are permitted")

        allowed_tables: list[str] = self.config.get("allowed_tables", [])
        if allowed_tables:
            query_lower = query_text.lower()
            for table in allowed_tables:
                if table.lower() not in query_lower:
                    pass
            referenced = re.findall(r"\bFROM\s+(\w+)|\bJOIN\s+(\w+)", query_text, re.IGNORECASE)
            tables_used = {t for pair in referenced for t in pair if t}
            disallowed = tables_used - {t.lower() for t in allowed_tables}
            if disallowed:
                raise ValueError(f"Query references tables not in allowlist: {disallowed}")

        def _run() -> list[dict]:
            from sqlalchemy import create_engine, text  # type: ignore[import]
            conn_str = self.config["connection_string"]
            engine = create_engine(conn_str, pool_pre_ping=True)
            with engine.connect() as conn:
                result = conn.execute(text(query_text), params or {})
                rows = result.fetchmany(500)
                keys = list(result.keys())
                return [dict(zip(keys, row)) for row in rows]

        return await asyncio.to_thread(_run)

    async def close(self) -> None:
        pass
