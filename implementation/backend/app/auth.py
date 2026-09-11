"""HS256 bearer verification.

The organisation a request acts in comes from the token's ``orgs`` claim and the
optional ``X-Organization-Id`` header. A missing, malformed, expired or badly
signed token is a 401 ``unauthorized``; that mapping lives here so routers only
ever see validated :class:`Claims`.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import jwt

from app.errors import unauthorized


@dataclass(frozen=True, slots=True)
class Claims:
    """The subset of the bearer token the service relies on."""

    sub: str
    orgs: tuple[UUID, ...]


def verify_bearer(token: str, secret: str) -> Claims:
    """Verify an HS256 token and return its claims, or raise ``unauthorized``."""
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"], "verify_exp": True},
        )
    except jwt.PyJWTError as exc:
        raise unauthorized() from exc

    sub = payload.get("sub")
    raw_orgs = payload.get("orgs")
    if not isinstance(sub, str) or not sub or not isinstance(raw_orgs, list) or not raw_orgs:
        raise unauthorized()

    try:
        orgs = tuple(UUID(str(value)) for value in raw_orgs)
    except (TypeError, ValueError) as exc:
        raise unauthorized() from exc

    return Claims(sub=sub, orgs=orgs)


def claims_from_authorization(header: str | None, secret: str) -> Claims:
    """Parse an ``Authorization`` header and verify the bearer token."""
    if not header:
        raise unauthorized()
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized()
    return verify_bearer(token.strip(), secret)
