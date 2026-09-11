"""Application configuration. Environment only, no defaults that point anywhere but localhost."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, loaded from the environment (and an optional ``.env``)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/categories"
    transactions_api_url: str = "http://localhost:8080"
    auth_hs256_secret: str = "assignment-dev-secret"
    port: int = 8081

    # Upstream reads are bounded; the contract names two seconds for a failure to
    # become `transactions_unavailable`.
    transactions_timeout_seconds: float = 2.0


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
