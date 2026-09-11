"""The service's own OpenAPI document must match the contract operation for operation.

The contract is the source of truth for ids, paths and status codes; this test
pins our published document to it so a stray FastAPI default cannot drift in.
"""

from __future__ import annotations

from typing import Any

from app.main import create_app

EXPECTED_STATUSES: dict[tuple[str, str], tuple[str, ...]] = {
    ("get", "/api/v1/app/transaction-categories"): ("200", "401", "403"),
    ("post", "/api/v1/app/transaction-categories"): ("201", "401", "403", "409", "422"),
    ("patch", "/api/v1/app/transaction-categories/{category_id}"): (
        "200",
        "401",
        "403",
        "404",
        "409",
        "422",
    ),
    ("delete", "/api/v1/app/transaction-categories/{category_id}"): (
        "204",
        "401",
        "403",
        "404",
        "409",
    ),
    ("put", "/api/v1/app/transactions/{transaction_id}/category"): (
        "200",
        "401",
        "403",
        "404",
        "422",
        "503",
    ),
    ("get", "/api/v1/app/transaction-category-assignments"): ("200", "401", "403", "422"),
}

EXPECTED_OPERATION_IDS: dict[tuple[str, str], str] = {
    ("get", "/api/v1/app/transaction-categories"): "listTransactionCategories",
    ("post", "/api/v1/app/transaction-categories"): "createTransactionCategory",
    ("patch", "/api/v1/app/transaction-categories/{category_id}"): "updateTransactionCategory",
    ("delete", "/api/v1/app/transaction-categories/{category_id}"): "deleteTransactionCategory",
    ("put", "/api/v1/app/transactions/{transaction_id}/category"): "setTransactionCategory",
    ("get", "/api/v1/app/transaction-category-assignments"): "lookupTransactionCategoryAssignments",
}


def test_openapi_matches_the_contract_operations() -> None:
    schema: dict[str, Any] = create_app().openapi()

    assert set(schema["paths"]) == {path for _, path in EXPECTED_STATUSES}
    for (method, path), statuses in EXPECTED_STATUSES.items():
        operation: dict[str, Any] = schema["paths"][path][method]
        assert operation["operationId"] == EXPECTED_OPERATION_IDS[(method, path)], f"{method} {path}"
        assert tuple(sorted(operation["responses"])) == statuses, f"{method.upper()} {path}"
