"""Assignment endpoints: set/clear one, look up a page."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import AuthorizationDep, ClaimsDep, OrganisationDep, SessionDep, TransactionsClientDep
from app.domain import service
from app.domain.schemas import (
    ERROR_RESPONSES,
    NOT_FOUND_RESPONSES,
    SERVICE_UNAVAILABLE_RESPONSES,
    AssignmentEnvelope,
    AssignmentListEnvelope,
    AssignmentListOut,
    AssignmentOut,
    AssignmentSet,
    TransactionId,
)
from app.logging import get_correlation_id

router = APIRouter(prefix="/api/v1/app", tags=["transaction-category-assignments"])

_TransactionIds = Annotated[list[TransactionId], Query(min_length=1, max_length=100)]


@router.put(
    "/transactions/{transaction_id}/category",
    response_model=AssignmentEnvelope,
    operation_id="setTransactionCategory",
    summary="Set or clear the category of a transaction",
    responses={**ERROR_RESPONSES, **NOT_FOUND_RESPONSES, **SERVICE_UNAVAILABLE_RESPONSES},
)
async def set_transaction_category(
    transaction_id: TransactionId,
    payload: AssignmentSet,
    session: SessionDep,
    organisation: OrganisationDep,
    claims: ClaimsDep,
    authorization: AuthorizationDep,
    upstream: TransactionsClientDep,
) -> AssignmentEnvelope:
    assignment = await service.set_assignment(
        session,
        organisation,
        transaction_id=transaction_id,
        category_id=payload.category_id,
        subject=claims.sub,
        authorization=authorization,
        upstream=upstream,
    )
    return AssignmentEnvelope(data=assignment, correlation_id=get_correlation_id())


@router.get(
    "/transaction-category-assignments",
    response_model=AssignmentListEnvelope,
    operation_id="lookupTransactionCategoryAssignments",
    summary="Look up the categories of up to 100 transactions",
    responses={**ERROR_RESPONSES, "422": NOT_FOUND_RESPONSES[422]},
)
async def lookup_transaction_category_assignments(
    transaction_id: _TransactionIds,
    session: SessionDep,
    organisation: OrganisationDep,
) -> AssignmentListEnvelope:
    items: list[AssignmentOut] = await service.lookup_assignments(session, organisation, transaction_id)
    return AssignmentListEnvelope(data=AssignmentListOut(items=items), correlation_id=get_correlation_id())
