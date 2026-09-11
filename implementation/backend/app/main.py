"""Application factory and lifespan."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import assignments, categories
from app.config import get_settings
from app.db import create_engine_and_factory
from app.errors import register_exception_handlers
from app.logging import RequestContextMiddleware, configure_logging
from app.upstream.transactions import TransactionsClient


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create the engine and upstream client once per process."""
    configure_logging()
    settings = get_settings()
    engine, session_factory = create_engine_and_factory(settings.database_url)
    upstream = TransactionsClient(settings.transactions_api_url, settings.transactions_timeout_seconds)
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.transactions_client = upstream
    try:
        yield
    finally:
        await upstream.aclose()
        await engine.dispose()


def create_app() -> FastAPI:
    """Build the ASGI application."""
    app = FastAPI(
        title="Transaction categories (public)",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)
    app.include_router(categories.router)
    app.include_router(assignments.router)

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
