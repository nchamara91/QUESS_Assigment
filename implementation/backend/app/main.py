"""Application factory and lifespan."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.api import assignments, categories
from app.config import get_settings
from app.db import create_engine_and_factory
from app.errors import register_exception_handlers
from app.logging import RequestContextMiddleware, configure_logging
from app.upstream.transactions import TransactionsClient

# Operations for which the contract declares no 422. FastAPI adds one
# automatically to every operation with validated parameters (headers and path
# ids included), so it is stripped after generation to keep the published
# document identical to the contract. The runtime behaviour is unchanged.
_OPERATIONS_WITHOUT_422: tuple[tuple[str, str], ...] = (
    ("get", "/api/v1/app/transaction-categories"),
    ("delete", "/api/v1/app/transaction-categories/{category_id}"),
)


class CategoriesApp(FastAPI):
    """The application, publishing an OpenAPI document trimmed to the contract."""

    def openapi(self) -> dict[str, Any]:
        if self.openapi_schema is not None:
            return self.openapi_schema
        schema = get_openapi(
            title=self.title,
            version=self.version,
            openapi_version=self.openapi_version,
            routes=self.routes,
        )
        for method, path in _OPERATIONS_WITHOUT_422:
            responses: dict[str, Any] = schema["paths"][path][method]["responses"]
            responses.pop("422", None)
        self.openapi_schema = schema
        return schema


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
    settings = get_settings()
    app = CategoriesApp(
        title="Transaction categories (public)",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.add_middleware(RequestContextMiddleware)
    # Added last, so it is the outermost user middleware and its headers survive
    # the error paths the browser needs them on.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(categories.router)
    app.include_router(assignments.router)

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
