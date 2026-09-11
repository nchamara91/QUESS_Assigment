"""Upstream mapping: 404 -> not found, timeout / 5xx -> unavailable."""

from __future__ import annotations

import httpx
import pytest
import respx

from app.errors import DomainError
from app.upstream.transactions import TransactionsClient, UpstreamOutcome

URL = "http://upstream/api/v1/app/transactions/txn_" + "a" * 32


async def _client() -> TransactionsClient:
    return TransactionsClient("http://upstream", 2.0)


@respx.mock
async def test_404_maps_to_not_found() -> None:
    respx.get(URL).mock(return_value=httpx.Response(404))
    client = await _client()
    outcome = await client.get_transaction("txn_" + "a" * 32, authorization="Bearer t", organization_id="o")
    await client.aclose()
    assert outcome is UpstreamOutcome.NOT_FOUND


@respx.mock
async def test_500_maps_to_unavailable() -> None:
    respx.get(URL).mock(return_value=httpx.Response(500))
    client = await _client()
    outcome = await client.get_transaction("txn_" + "a" * 32, authorization="Bearer t", organization_id="o")
    await client.aclose()
    assert outcome is UpstreamOutcome.UNAVAILABLE


@respx.mock
async def test_timeout_maps_to_unavailable() -> None:
    respx.get(URL).mock(side_effect=httpx.ConnectTimeout("timed out"))
    client = await _client()
    outcome = await client.get_transaction("txn_" + "a" * 32, authorization="Bearer t", organization_id="o")
    await client.aclose()
    assert outcome is UpstreamOutcome.UNAVAILABLE


@respx.mock
async def test_200_maps_to_ok() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200, json={"data": {}, "correlation_id": "x"}))
    client = await _client()
    outcome = await client.get_transaction("txn_" + "a" * 32, authorization="Bearer t", organization_id="o")
    await client.aclose()
    assert outcome is UpstreamOutcome.OK


@pytest.mark.parametrize(
    ("outcome", "code"),
    [
        (UpstreamOutcome.NOT_FOUND, "transaction_not_found"),
        (UpstreamOutcome.UNAVAILABLE, "transactions_unavailable"),
    ],
)
def test_raise_for_maps_outcomes(outcome: UpstreamOutcome, code: str) -> None:
    client = TransactionsClient("http://upstream", 2.0)
    with pytest.raises(DomainError) as caught:
        client.raise_for(outcome)
    assert caught.value.code == code
