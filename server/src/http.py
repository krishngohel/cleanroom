"""Shared HTTP client for talking to the local Ollama runtime.

A single pooled AsyncClient avoids per-request TCP/TLS setup and lets
keep-alive connections be reused across chat completions — a measurable
latency win under concurrent load.
"""
from __future__ import annotations

import httpx

from .config import settings

_client: httpx.AsyncClient | None = None


def get_ollama_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=settings.ollama_base_url,
            timeout=httpx.Timeout(300.0, connect=10.0),
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=8),
        )
    return _client


async def close_ollama_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
