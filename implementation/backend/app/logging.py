"""Correlation id propagation and structured request logging.

One ASGI middleware owns both: it mints (or accepts) a correlation id, puts it
in a context variable so every helper can pick it up, writes it to the
``X-Correlation-Id`` response header, and emits exactly one JSON log line per
request carrying the same id.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_CORRELATION_ID: ContextVar[str] = ContextVar("correlation_id", default="")

CORRELATION_HEADER = "X-Correlation-Id"

_FORMATTER_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {
    "message",
    "asctime",
}


def new_correlation_id() -> str:
    """Mint a fresh correlation id."""
    return str(uuid.uuid4())


def get_correlation_id() -> str:
    """Return the correlation id for the current request, minting one if absent.

    A value is always present inside a request; the fallback covers unit tests
    that call helpers directly.
    """
    correlation_id = _CORRELATION_ID.get()
    if not correlation_id:
        correlation_id = new_correlation_id()
        _CORRELATION_ID.set(correlation_id)
    return correlation_id


class JsonFormatter(logging.Formatter):
    """Render every record as one JSON object, merging any ``extra`` keys."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _FORMATTER_RESERVED and key not in payload:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging() -> None:
    """Install the JSON formatter on the root logger exactly once."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


class RequestContextMiddleware:
    """Pure ASGI middleware: correlation id in, header and log line out."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.logger = logging.getLogger("app.request")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = MutableHeaders(scope=scope).get(CORRELATION_HEADER)
        correlation_id = incoming or new_correlation_id()
        token = _CORRELATION_ID.set(correlation_id)
        started = time.perf_counter()
        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                MutableHeaders(scope=message)[CORRELATION_HEADER] = correlation_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            self.logger.info(
                "request",
                extra={
                    "correlation_id": correlation_id,
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status_code": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            _CORRELATION_ID.reset(token)


__all__ = [
    "CORRELATION_HEADER",
    "JsonFormatter",
    "RequestContextMiddleware",
    "configure_logging",
    "get_correlation_id",
    "new_correlation_id",
]
