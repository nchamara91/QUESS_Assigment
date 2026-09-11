"""FastAPI dependencies: auth, organisation resolution, session, upstream client."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import Claims, claims_from_authorization
from app.config import Settings, get_settings
from app.errors import organization_context_forbidden, unauthorized, validation_error
from app.upstream.transactions import TransactionsClient


def get_settings_dep() -> Settings:
    """Expose the settings singleton to the dependency system."""
    return get_settings()


async def get_authorization_header(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Return the raw ``Authorization`` header, forwarding-ready."""
    if not authorization:
        raise unauthorized()
    return authorization


async def get_claims(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings_dep),
) -> Claims:
    """Verify the bearer token and return its claims."""
    return claims_from_authorization(authorization, settings.auth_hs256_secret)


async def get_organisation(
    claims: Claims = Depends(get_claims),
    x_organization_id: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> UUID:
    """Resolve the organisation the request acts in.

    Missing header -> the subject's first organisation. A header that is not a
    UUID -> ``400 validation_error``. A header the subject is not a member of ->
    ``403 organization_context_forbidden``.
    """
    if not x_organization_id:
        return claims.orgs[0]
    try:
        organisation = UUID(x_organization_id)
    except ValueError as exc:
        raise validation_error() from exc
    if organisation not in claims.orgs:
        raise organization_context_forbidden()
    return organisation


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield a database session bound to the app's connection pool."""
    factory = request.app.state.session_factory
    async with factory() as session:
        yield session


def get_transactions_client(request: Request) -> TransactionsClient:
    """Return the process-wide upstream client."""
    client: TransactionsClient = request.app.state.transactions_client
    return client


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
ClaimsDep = Annotated[Claims, Depends(get_claims)]
OrganisationDep = Annotated[UUID, Depends(get_organisation)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
TransactionsClientDep = Annotated[TransactionsClient, Depends(get_transactions_client)]
AuthorizationDep = Annotated[str, Depends(get_authorization_header)]
