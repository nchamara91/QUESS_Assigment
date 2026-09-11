"""Business rules for categories and assignments.

Pure-ish async functions over a session: they own the invariants the contract
names, and raise :class:`~app.errors.DomainError` for every failure. Routers map
ORM rows to the response schemas.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import TransactionCategory, TransactionCategoryAssignment
from app.domain.schemas import AssignmentOut
from app.domain.system_categories import SYSTEM_ORDER, ensure_system_categories
from app.errors import (
    category_limit_reached,
    category_not_found,
    name_taken,
    system_category_immutable,
)
from app.upstream.transactions import TransactionsClient

CUSTOM_CATEGORY_LIMIT = 50


async def list_categories(session: AsyncSession, organisation_id: uuid.UUID) -> list[TransactionCategory]:
    """All categories: system in canonical order, then custom by name then ``created_at``."""
    await ensure_system_categories(session, organisation_id)
    rows = list(
        (
            await session.scalars(
                select(TransactionCategory).where(TransactionCategory.organisation_id == organisation_id)
            )
        ).all()
    )
    system = sorted(
        (row for row in rows if row.kind == "system"),
        key=lambda row: SYSTEM_ORDER.get(row.code or "", len(SYSTEM_ORDER)),
    )
    custom = sorted(
        (row for row in rows if row.kind == "custom"),
        key=lambda row: (row.name.casefold(), row.created_at),
    )
    return [*system, *custom]


async def _count_custom(session: AsyncSession, organisation_id: uuid.UUID) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(TransactionCategory)
        .where(
            TransactionCategory.organisation_id == organisation_id,
            TransactionCategory.kind == "custom",
        )
    )
    return int(count or 0)


async def _name_holder(session: AsyncSession, organisation_id: uuid.UUID, folded: str) -> uuid.UUID | None:
    holder: uuid.UUID | None = await session.scalar(
        select(TransactionCategory.category_id).where(
            TransactionCategory.organisation_id == organisation_id,
            TransactionCategory.name_folded == folded,
        )
    )
    return holder


async def create_category(
    session: AsyncSession, organisation_id: uuid.UUID, *, name: str, color: str
) -> TransactionCategory:
    """Create a custom category; uniqueness is enforced by the database."""
    await ensure_system_categories(session, organisation_id)
    if await _count_custom(session, organisation_id) >= CUSTOM_CATEGORY_LIMIT:
        raise category_limit_reached(CUSTOM_CATEGORY_LIMIT)

    category = TransactionCategory(
        organisation_id=organisation_id,
        kind="custom",
        code=None,
        name=name,
        name_folded=name.casefold(),
        color=color,
    )
    session.add(category)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        holder = await _name_holder(session, organisation_id, name.casefold())
        if holder is None:
            raise
        raise name_taken(str(holder)) from exc
    await session.refresh(category)
    return category


async def update_category(
    session: AsyncSession,
    organisation_id: uuid.UUID,
    category_id: uuid.UUID,
    *,
    name: str | None,
    color: str | None,
) -> TransactionCategory:
    """Rename and/or recolour a custom category."""
    category = await session.scalar(
        select(TransactionCategory).where(
            TransactionCategory.organisation_id == organisation_id,
            TransactionCategory.category_id == category_id,
        )
    )
    if category is None:
        raise category_not_found()
    if category.kind == "system":
        raise system_category_immutable()

    if name is not None:
        category.name = name
        category.name_folded = name.casefold()
    if color is not None:
        category.color = color

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        holder = await _name_holder(session, organisation_id, (name or "").casefold())
        if holder is None:
            raise
        raise name_taken(str(holder)) from exc
    await session.refresh(category)
    return category


async def delete_category(session: AsyncSession, organisation_id: uuid.UUID, category_id: uuid.UUID) -> None:
    """Hard-delete a custom category; assignments cascade away in the database."""
    category = await session.scalar(
        select(TransactionCategory).where(
            TransactionCategory.organisation_id == organisation_id,
            TransactionCategory.category_id == category_id,
        )
    )
    if category is None:
        raise category_not_found()
    if category.kind == "system":
        raise system_category_immutable()
    await session.delete(category)
    await session.commit()


async def set_assignment(
    session: AsyncSession,
    organisation_id: uuid.UUID,
    *,
    transaction_id: str,
    category_id: uuid.UUID | None,
    subject: str,
    authorization: str,
    upstream: TransactionsClient,
) -> AssignmentOut:
    """Set or clear one transaction's category.

    The category is checked locally first, then the transactions API is asked
    whether the transaction is visible. Nothing is written unless both succeed.
    Re-setting the same category preserves ``assigned_at``.
    """
    if category_id is not None:
        exists = await session.scalar(
            select(TransactionCategory.category_id).where(
                TransactionCategory.organisation_id == organisation_id,
                TransactionCategory.category_id == category_id,
            )
        )
        if exists is None:
            raise category_not_found()

    upstream.raise_for(
        await upstream.get_transaction(
            transaction_id,
            authorization=authorization,
            organization_id=str(organisation_id),
        )
    )

    assignment = await session.get(TransactionCategoryAssignment, (organisation_id, transaction_id))
    if category_id is None:
        if assignment is not None:
            await session.delete(assignment)
            await session.commit()
        return AssignmentOut(transaction_id=transaction_id, category_id=None, assigned_at=None, assigned_by=None)

    if assignment is None:
        assignment = TransactionCategoryAssignment(
            organisation_id=organisation_id,
            transaction_id=transaction_id,
            category_id=category_id,
            assigned_at=datetime.now(UTC),
            assigned_by=subject,
        )
        session.add(assignment)
    elif assignment.category_id != category_id:
        assignment.category_id = category_id
        assignment.assigned_at = datetime.now(UTC)
        assignment.assigned_by = subject

    await session.commit()
    await session.refresh(assignment)
    return AssignmentOut(
        transaction_id=assignment.transaction_id,
        category_id=assignment.category_id,
        assigned_at=assignment.assigned_at,
        assigned_by=assignment.assigned_by,
    )


async def lookup_assignments(
    session: AsyncSession, organisation_id: uuid.UUID, transaction_ids: list[str]
) -> list[AssignmentOut]:
    """One item per distinct requested id, in first-requested order."""
    distinct = list(dict.fromkeys(transaction_ids))
    rows = (
        await session.scalars(
            select(TransactionCategoryAssignment).where(
                TransactionCategoryAssignment.organisation_id == organisation_id,
                TransactionCategoryAssignment.transaction_id.in_(distinct),
            )
        )
    ).all()
    by_transaction = {row.transaction_id: row for row in rows}

    result: list[AssignmentOut] = []
    for transaction_id in distinct:
        row = by_transaction.get(transaction_id)
        if row is None or row.category_id is None:
            result.append(
                AssignmentOut(transaction_id=transaction_id, category_id=None, assigned_at=None, assigned_by=None)
            )
        else:
            result.append(
                AssignmentOut(
                    transaction_id=row.transaction_id,
                    category_id=row.category_id,
                    assigned_at=row.assigned_at,
                    assigned_by=row.assigned_by,
                )
            )
    return result
