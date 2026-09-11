"""Tests that need a real PostgreSQL, from the CI service or docker compose.

They use `DATABASE_URL` from the environment and clean up the organisation they
create. Run `docker compose up -d db` first (or the whole stack).
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db import create_engine_and_factory
from app.domain import service
from app.domain.models import TransactionCategory, TransactionCategoryAssignment
from app.errors import DomainError
from app.upstream.transactions import TransactionsClient, UpstreamOutcome


@pytest.fixture
async def factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    settings = get_settings()
    engine, session_factory = create_engine_and_factory(settings.database_url)
    try:
        # Fail fast if no database is reachable, rather than hanging the suite.
        async with engine.connect():
            pass
    except Exception:
        await engine.dispose()
        pytest.skip("no PostgreSQL reachable for database-backed tests")
    yield session_factory
    await engine.dispose()


async def _drop_organisation(factory: async_sessionmaker[AsyncSession], organisation_id: uuid.UUID) -> None:
    async with factory() as session:
        await session.execute(
            delete(TransactionCategoryAssignment).where(
                TransactionCategoryAssignment.organisation_id == organisation_id
            )
        )
        await session.execute(delete(TransactionCategory).where(TransactionCategory.organisation_id == organisation_id))
        await session.commit()


async def test_two_concurrent_creates_yield_one_success_one_conflict(
    factory: async_sessionmaker[AsyncSession],
) -> None:
    organisation_id = uuid.uuid4()
    name = f"Race {uuid.uuid4().hex[:8]}"

    async def attempt() -> str:
        async with factory() as session:
            try:
                await service.create_category(session, organisation_id, name=name, color="blue")
            except DomainError as exc:
                return exc.code
            return "ok"

    try:
        results = await asyncio.gather(attempt(), attempt())
    finally:
        await _drop_organisation(factory, organisation_id)

    assert sorted(results) == ["ok", "transaction_category_name_taken"]


class _UnavailableUpstream(TransactionsClient):
    """An upstream that is down, without any HTTP."""

    def __init__(self) -> None:
        super().__init__("http://unused", 0.001)

    async def get_transaction(
        self, transaction_id: str, *, authorization: str, organization_id: str
    ) -> UpstreamOutcome:
        return UpstreamOutcome.UNAVAILABLE


async def test_unavailable_upstream_writes_nothing(
    factory: async_sessionmaker[AsyncSession],
) -> None:
    organisation_id = uuid.uuid4()
    transaction_id = "txn_" + "b" * 32

    try:
        async with factory() as session:
            category = await service.create_category(session, organisation_id, name="Temporary", color="blue")
            category_id = category.category_id

        async with factory() as session:
            with pytest.raises(DomainError) as caught:
                await service.set_assignment(
                    session,
                    organisation_id,
                    transaction_id=transaction_id,
                    category_id=category_id,
                    subject="idp|owner-a",
                    authorization="Bearer token",
                    upstream=_UnavailableUpstream(),
                )
        assert caught.value.code == "transactions_unavailable"

        async with factory() as session:
            row = await session.get(TransactionCategoryAssignment, (organisation_id, transaction_id))
            assert row is None
    finally:
        await _drop_organisation(factory, organisation_id)
