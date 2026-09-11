"""Auth and organisation-context rules at the HTTP boundary."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import ORG_A, ORG_B, mint

CATEGORIES = "/api/v1/app/transaction-categories"


async def test_missing_bearer_is_unauthorized(client: AsyncClient) -> None:
    response = await client.get(CATEGORIES)
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "unauthorized"
    assert response.headers["X-Correlation-Id"] == body["correlation_id"]


async def test_bad_signature_is_unauthorized(client: AsyncClient) -> None:
    token = mint(secret="not-the-secret")
    response = await client.get(CATEGORIES, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_expired_token_is_unauthorized(client: AsyncClient) -> None:
    token = mint(expires_in=-60)
    response = await client.get(CATEGORIES, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_foreign_organisation_is_forbidden(client: AsyncClient) -> None:
    token = mint(orgs=(ORG_A,))
    response = await client.get(
        CATEGORIES,
        headers={"Authorization": f"Bearer {token}", "X-Organization-Id": str(ORG_B)},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "organization_context_forbidden"


async def test_malformed_organisation_header_is_validation_error(client: AsyncClient) -> None:
    token = mint()
    response = await client.get(
        CATEGORIES,
        headers={"Authorization": f"Bearer {token}", "X-Organization-Id": "not-a-uuid"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
