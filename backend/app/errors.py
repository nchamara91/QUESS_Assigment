"""Domain errors and the two error body shapes from the contract.

The contract has three families:

* domain errors      -> ``{type, correlation_id, error: {code, message, data?}}``
* validation errors  -> ``{type: "ValidationError", correlation_id, error: {field: [issue, ...]}}``
* a malformed ``X-Organization-Id`` -> ``400 validation_error`` (a domain error)
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from pydantic_core import ErrorDetails

from app.logging import get_correlation_id


class DomainError(Exception):
    """A contract error with a stable code, an HTTP status and optional data."""

    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        type_name: str = "DomainError",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.type_name = type_name
        self.data = data

    def body(self) -> dict[str, Any]:
        error: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.data is not None:
            error["data"] = self.data
        return {"type": self.type_name, "correlation_id": get_correlation_id(), "error": error}


def unauthorized() -> DomainError:
    return DomainError(
        status_code=401,
        code="unauthorized",
        message="Authentication credentials were missing or invalid.",
        type_name="UnauthorizedError",
    )


def organization_context_forbidden() -> DomainError:
    return DomainError(
        status_code=403,
        code="organization_context_forbidden",
        message="The caller is not an active member of the requested organisation.",
        type_name="ForbiddenError",
    )


def validation_error(message: str = "The organization id is not a valid UUID.") -> DomainError:
    return DomainError(
        status_code=400,
        code="validation_error",
        message=message,
        type_name="ValidationError",
    )


def category_not_found() -> DomainError:
    return DomainError(
        status_code=404,
        code="transaction_category_not_found",
        message="No such category for this organisation.",
        type_name="NotFoundError",
    )


def transaction_not_found() -> DomainError:
    return DomainError(
        status_code=404,
        code="transaction_not_found",
        message="No such transaction for this organisation.",
        type_name="NotFoundError",
    )


def name_taken(category_id: str) -> DomainError:
    return DomainError(
        status_code=409,
        code="transaction_category_name_taken",
        message="A category with this name already exists for this organisation.",
        type_name="ConflictError",
        data={"category_id": category_id},
    )


def category_limit_reached(limit: int = 50) -> DomainError:
    return DomainError(
        status_code=409,
        code="transaction_category_limit_reached",
        message=f"This organisation already has {limit} custom categories.",
        type_name="ConflictError",
        data={"limit": limit},
    )


def system_category_immutable() -> DomainError:
    return DomainError(
        status_code=409,
        code="system_category_immutable",
        message="System categories cannot be renamed, recoloured or deleted.",
        type_name="ConflictError",
    )


def transactions_unavailable() -> DomainError:
    return DomainError(
        status_code=503,
        code="transactions_unavailable",
        message="The transactions service is unavailable, nothing was written.",
        type_name="ServiceUnavailableError",
    )


# Pydantic error type -> contract issue code. Types already in snake_case and
# equal to an issue code (``blank``, ``empty``) pass through unchanged.
_ISSUE_CODE_BY_TYPE: dict[str, str] = {
    "missing": "required",
    "string_too_short": "blank",
    "string_too_long": "too_long",
    "too_long": "too_many_items",
    "too_short": "required",
    "list_type": "invalid_format",
    "string_type": "invalid_format",
    "enum": "invalid_choice",
    "literal_error": "invalid_choice",
    "uuid_parsing": "invalid_format",
    "uuid_type": "invalid_format",
    "string_pattern_mismatch": "invalid_format",
    "extra_forbidden": "invalid_format",
    "value_error": "invalid",
}

_LOCATION_PREFIXES = frozenset({"body", "path", "query", "header", "cookie"})


def _field_name(loc: tuple[str | int, ...]) -> str:
    """Map a Pydantic error location to the contract's field key.

    Path/query/body prefixes are dropped and integer indexes (list items) are
    skipped, so ``("query", "transaction_id", 3)`` becomes ``transaction_id``.
    A model-level error (``("body",)``) becomes ``non_field_errors``.
    """
    parts = [part for part in loc if not isinstance(part, int)]
    if parts and parts[0] in _LOCATION_PREFIXES:
        parts = parts[1:]
    return ".".join(str(part) for part in parts) if parts else "non_field_errors"


def validation_body(errors: Sequence[ErrorDetails]) -> dict[str, Any]:
    """Group Pydantic errors into the contract's field -> issue list map."""
    grouped: dict[str, list[dict[str, str]]] = {}
    for error in errors:
        raw_type = str(error.get("type", "invalid"))
        issue_code = _ISSUE_CODE_BY_TYPE.get(raw_type, raw_type)
        field = _field_name(tuple(error.get("loc", ())))
        grouped.setdefault(field, []).append({"code": issue_code, "message": str(error.get("msg", "Invalid value."))})
    return {"type": "ValidationError", "correlation_id": get_correlation_id(), "error": grouped}


async def _handle_domain_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    return JSONResponse(status_code=exc.status_code, content=exc.body())


async def _handle_request_validation(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(status_code=422, content=validation_body(exc.errors()))


async def _handle_model_validation(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ValidationError)
    return JSONResponse(status_code=422, content=validation_body(exc.errors()))


async def _handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
    error = DomainError(
        status_code=500,
        code="internal_error",
        message="An unexpected error occurred.",
        type_name="InternalError",
    )
    return JSONResponse(status_code=500, content=error.body())


def register_exception_handlers(app: FastAPI) -> None:
    """Attach every handler that shapes an error body."""
    app.add_exception_handler(DomainError, _handle_domain_error)
    app.add_exception_handler(RequestValidationError, _handle_request_validation)
    app.add_exception_handler(ValidationError, _handle_model_validation)
    app.add_exception_handler(Exception, _handle_unexpected)
