"""Shared test fixtures.

The acceptance-style tests need a real PostgreSQL (see the CI service and
``docker compose``); the fast unit tests below run without one.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.deps import get_session
from app.main import create_app

TEST_SECRET = "assignment-dev-secret"
ORG_A = uuid.UUID("3f9c2a1e-6b7d-4e8f-9a0b-1c2d3e4f5a61")
ORG_B = uuid.UUID("b7e1d4c2-0a9f-4c3b-8d5e-6f7a8b9c0d12")


def mint(
    sub: str = "idp|owner-a",
    orgs: tuple[uuid.UUID, ...] = (ORG_A,),
    *,
    secret: str = TEST_SECRET,
    expires_in: int = 3600,
) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "iss": "assignment-mock",
        "sub": sub,
        "email": "owner@acme-robotics.test",
        "orgs": [str(org) for org in orgs],
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def settings() -> Settings:
    return Settings(auth_hs256_secret=TEST_SECRET)


@pytest.fixture
def app() -> Any:
    application = create_app()

    async def _session_override() -> AsyncIterator[None]:
        # Endpoints that touch the database are exercised against PostgreSQL;
        # here we only need the dependency to resolve so auth/validation run.
        yield None

    application.dependency_overrides[get_session] = _session_override
    return application


@pytest.fixture
async def client(app: Any) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
