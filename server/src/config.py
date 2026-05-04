from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Cleanroom AI"
    debug: bool = False
    database_url: str = "sqlite+aiosqlite:///./cleanroom.db"

    ollama_base_url: str = "http://localhost:11434"
    default_model: str = "llama3.1:8b"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:80"]

    max_context_tokens: int = 8192
    connector_timeout_seconds: int = 30

    log_level: str = "INFO"


settings = Settings()
