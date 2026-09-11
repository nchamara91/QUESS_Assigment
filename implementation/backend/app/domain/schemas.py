"""Request/response schemas and the validation rules the contract names.

Pydantic error *types* produced here (``blank``, ``too_long``, ``empty``) are
translated into the contract's issue codes by ``app.errors``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

CategoryColor = Literal["slate", "blue", "teal", "green", "amber", "orange", "red", "purple"]
CategoryKind = Literal["system", "custom"]

_TRANSACTION_ID_PATTERN = r"^txn_[0-9a-f]{32}$"
CategoryId = uuid.UUID
TransactionId = Annotated[str, StringConstraints(pattern=_TRANSACTION_ID_PATTERN)]


def _clean_name(value: object) -> str:
    """Trim, then require 1-40 characters, as the contract specifies."""
    if not isinstance(value, str):
        raise PydanticCustomError("string_type", "Name must be a string.")
    cleaned = value.strip()
    if not cleaned:
        raise PydanticCustomError("blank", "Name must not be blank.")
    if len(cleaned) > 40:
        raise PydanticCustomError("string_too_long", "Name must be at most 40 characters.")
    return cleaned


CategoryName = Annotated[str, BeforeValidator(_clean_name)]


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName
    color: CategoryColor


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName | None = None
    color: CategoryColor | None = None

    @model_validator(mode="after")
    def _at_least_one_change(self) -> CategoryUpdate:
        if self.name is None and self.color is None:
            raise PydanticCustomError("empty", "At least one of name or color is required.")
        return self


class AssignmentSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: CategoryId | None


class CategoryOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: uuid.UUID
    kind: CategoryKind
    code: str | None
    name: str
    color: CategoryColor
    created_at: datetime
    updated_at: datetime


class AssignmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transaction_id: str
    category_id: uuid.UUID | None
    assigned_at: datetime | None
    assigned_by: str | None


class CategoryListOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[CategoryOut]


class AssignmentListOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[AssignmentOut]


class CategoryEnvelope(BaseModel):
    data: CategoryOut
    correlation_id: uuid.UUID


class CategoryListEnvelope(BaseModel):
    data: CategoryListOut
    correlation_id: uuid.UUID


class AssignmentEnvelope(BaseModel):
    data: AssignmentOut
    correlation_id: uuid.UUID


class AssignmentListEnvelope(BaseModel):
    data: AssignmentListOut
    correlation_id: uuid.UUID


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorEnvelope(BaseModel):
    type: str
    correlation_id: uuid.UUID
    error: ErrorDetail


class ValidationIssueOut(BaseModel):
    code: str
    message: str


class ValidationErrorEnvelope(BaseModel):
    type: Literal["ValidationError"]
    correlation_id: uuid.UUID
    error: dict[str, list[ValidationIssueOut]]


# Reusable OpenAPI response metadata so the generated document matches the
# contract's status codes for each operation.
ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    401: {"model": ErrorEnvelope, "description": "`unauthorized`"},
    403: {"model": ErrorEnvelope, "description": "`organization_context_forbidden`"},
}
NOT_FOUND_RESPONSES: dict[int | str, dict[str, object]] = {
    404: {"model": ErrorEnvelope, "description": "`transaction_category_not_found` / `transaction_not_found`"},
    422: {"model": ValidationErrorEnvelope, "description": "Validation map, keyed by field name"},
}
# Delete declares no 422 in the contract (a malformed id still answers 422 at
# runtime; that gap is reported in docs/DECISIONS.md).
NOT_FOUND_ONLY_RESPONSES: dict[int | str, dict[str, object]] = {
    404: {"model": ErrorEnvelope, "description": "`transaction_category_not_found`"},
}
CONFLICT_RESPONSES: dict[int | str, dict[str, object]] = {
    409: {"model": ErrorEnvelope, "description": "Conflict"},
}
SERVICE_UNAVAILABLE_RESPONSES: dict[int | str, dict[str, object]] = {
    503: {"model": ErrorEnvelope, "description": "`transactions_unavailable`"},
}
