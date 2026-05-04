from __future__ import annotations

from abc import ABC, abstractmethod


class BaseConnector(ABC):
    def __init__(self, connector_id: str, config: dict) -> None:
        self.connector_id = connector_id
        self.config = config

    @property
    @abstractmethod
    def connector_type(self) -> str: ...

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def query(self, query_text: str, params: dict) -> list[dict]: ...

    @abstractmethod
    async def close(self) -> None: ...

    async def __aenter__(self) -> "BaseConnector":
        await self.connect()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()
