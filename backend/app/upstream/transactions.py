"""The transactions API is an upstream we do not own.

One narrow read: is this transaction visible to the organisation? The caller's
bearer and ``X-Organization-Id`` are forwarded unchanged. The result is a small
enum so the service layer, not the HTTP client, decides how to map failures.
"""

from __future__ import annotations

from enum import Enum

import httpx

from app.errors import transaction_not_found, transactions_unavailable


class UpstreamOutcome(Enum):
    """What the transactions API said (or failed to say)."""

    OK = "ok"
    NOT_FOUND = "not_found"
    UNAVAILABLE = "unavailable"


class TransactionsClient:
    """Thin async client for the two-second-bounded visibility check."""

    def __init__(self, base_url: str, timeout_seconds: float, client: httpx.AsyncClient | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._client = client if client is not None else httpx.AsyncClient()

    async def get_transaction(
        self,
        transaction_id: str,
        *,
        authorization: str,
        organization_id: str,
    ) -> UpstreamOutcome:
        """Read one transaction; a 404 means not visible, any failure means unavailable."""
        url = f"{self._base_url}/api/v1/app/transactions/{transaction_id}"
        headers = {"Authorization": authorization, "X-Organization-Id": organization_id}
        try:
            response = await self._client.get(url, headers=headers, timeout=self._timeout)
        except httpx.HTTPError:
            return UpstreamOutcome.UNAVAILABLE

        if response.status_code == httpx.codes.NOT_FOUND:
            return UpstreamOutcome.NOT_FOUND
        if response.is_success:
            return UpstreamOutcome.OK
        return UpstreamOutcome.UNAVAILABLE

    def raise_for(self, outcome: UpstreamOutcome) -> None:
        """Translate a failure outcome into the contract's domain error."""
        if outcome is UpstreamOutcome.NOT_FOUND:
            raise transaction_not_found()
        if outcome is UpstreamOutcome.UNAVAILABLE:
            raise transactions_unavailable()

    async def aclose(self) -> None:
        await self._client.aclose()
