"""Database engine, session factory and declarative base."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for every table in the service."""


def create_engine_and_factory(database_url: str) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Build the async engine and session factory for one process."""
    engine = create_async_engine(database_url, pool_pre_ping=True, future=True)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return engine, factory


async def session_scope(factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    """Yield a session; callers own the transaction."""
    async with factory() as session:
        yield session
