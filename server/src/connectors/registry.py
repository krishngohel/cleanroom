from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .base import BaseConnector
from .filesystem import FilesystemConnector
from .sql import SQLConnector

log = structlog.get_logger()

_CONNECTOR_TYPES: dict[str, type[BaseConnector]] = {
    "filesystem": FilesystemConnector,
    "sql": SQLConnector,
}


class ConnectorRegistry:
    def __init__(self) -> None:
        self._connectors: dict[str, BaseConnector] = {}

    async def load_from_db(self, db: AsyncSession) -> None:
        from ..database import Connector

        result = await db.execute(
            select(Connector).where(Connector.is_active == True)  # noqa: E712
        )
        connectors = result.scalars().all()

        loaded = 0
        for c in connectors:
            cls = _CONNECTOR_TYPES.get(c.connector_type)
            if cls is None:
                log.warning("unknown_connector_type", name=c.name, type=c.connector_type)
                continue
            self._connectors[c.id] = cls(connector_id=c.id, config=c.config)
            loaded += 1

        log.info("connectors_loaded", count=loaded)

    def get(self, connector_id: str) -> BaseConnector | None:
        return self._connectors.get(connector_id)

    def list_connectors(self) -> list[dict]:
        return [
            {"id": cid, "type": c.connector_type}
            for cid, c in self._connectors.items()
        ]
