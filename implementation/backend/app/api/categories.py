"""Category dictionary endpoints."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Path, Response, status

from app.deps import OrganisationDep, SessionDep
from app.domain import service
from app.domain.models import TransactionCategory
from app.domain.schemas import (
    CONFLICT_RESPONSES,
    ERROR_RESPONSES,
    NOT_FOUND_ONLY_RESPONSES,
    NOT_FOUND_RESPONSES,
    CategoryCreate,
    CategoryEnvelope,
    CategoryListEnvelope,
    CategoryListOut,
    CategoryOut,
    CategoryUpdate,
)
from app.logging import get_correlation_id

router = APIRouter(prefix="/api/v1/app/transaction-categories", tags=["transaction-categories"])

_CategoryId = Annotated[uuid.UUID, Path()]


def _to_out(category: TransactionCategory) -> CategoryOut:
    return CategoryOut(
        category_id=category.category_id,
        kind=category.kind,
        code=category.code,
        name=category.name,
        color=category.color,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.get(
    "",
    response_model=CategoryListEnvelope,
    operation_id="listTransactionCategories",
    summary="List the categories of the organisation",
    responses={**ERROR_RESPONSES},
)
async def list_transaction_categories(
    session: SessionDep,
    organisation: OrganisationDep,
) -> CategoryListEnvelope:
    categories = await service.list_categories(session, organisation)
    return CategoryListEnvelope(
        data=CategoryListOut(items=[_to_out(category) for category in categories]),
        correlation_id=get_correlation_id(),
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CategoryEnvelope,
    operation_id="createTransactionCategory",
    summary="Create a custom category",
    responses={**ERROR_RESPONSES, **CONFLICT_RESPONSES},
)
async def create_transaction_category(
    payload: CategoryCreate,
    session: SessionDep,
    organisation: OrganisationDep,
) -> CategoryEnvelope:
    category = await service.create_category(session, organisation, name=payload.name, color=payload.color)
    return CategoryEnvelope(data=_to_out(category), correlation_id=get_correlation_id())


@router.patch(
    "/{category_id}",
    response_model=CategoryEnvelope,
    operation_id="updateTransactionCategory",
    summary="Rename or recolour a custom category",
    responses={**ERROR_RESPONSES, **NOT_FOUND_RESPONSES, **CONFLICT_RESPONSES},
)
async def update_transaction_category(
    category_id: _CategoryId,
    payload: CategoryUpdate,
    session: SessionDep,
    organisation: OrganisationDep,
) -> CategoryEnvelope:
    category = await service.update_category(session, organisation, category_id, name=payload.name, color=payload.color)
    return CategoryEnvelope(data=_to_out(category), correlation_id=get_correlation_id())


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteTransactionCategory",
    summary="Delete a custom category",
    responses={**ERROR_RESPONSES, **NOT_FOUND_ONLY_RESPONSES, **CONFLICT_RESPONSES},
)
async def delete_transaction_category(
    category_id: _CategoryId,
    session: SessionDep,
    organisation: OrganisationDep,
) -> Response:
    await service.delete_category(session, organisation, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
