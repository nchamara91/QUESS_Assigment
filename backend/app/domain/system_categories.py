"""The nine system categories every organisation has.

Seeding is lazy: ``ensure_system_categories`` runs at the start of every request
and inserts any missing canonical rows. ``ON CONFLICT DO NOTHING`` on
``(organisation_id, code)`` makes concurrent first requests safe. Ids are
minted per organisation and persisted, so they are stable once created.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import TransactionCategory

# (code, name, color), in canonical order. Mirrors ``x-system-categories`` in
# the contract; clients key on ``code``, never on the per-organisation id.
SYSTEM_CATEGORY_SPECS: tuple[tuple[str, str, str], ...] = (
    ("income", "Income", "green"),
    ("payroll", "Payroll", "blue"),
    ("suppliers", "Suppliers", "teal"),
    ("taxes", "Taxes", "red"),
    ("fees", "Fees", "amber"),
    ("software", "Software", "purple"),
    ("travel", "Travel", "orange"),
    ("transfer", "Internal transfer", "slate"),
    ("other", "Other", "slate"),
)

SYSTEM_ORDER: dict[str, int] = {code: index for index, (code, _, _) in enumerate(SYSTEM_CATEGORY_SPECS)}


async def ensure_system_categories(session: AsyncSession, organisation_id: uuid.UUID) -> None:
    """Insert any missing system categories for the organisation, then commit."""
    existing = set(
        (
            await session.scalars(
                select(TransactionCategory.code).where(
                    TransactionCategory.organisation_id == organisation_id,
                    TransactionCategory.kind == "system",
                )
            )
        ).all()
    )
    missing = [spec for spec in SYSTEM_CATEGORY_SPECS if spec[0] not in existing]
    if not missing:
        return

    rows = [
        {
            "category_id": uuid.uuid4(),
            "organisation_id": organisation_id,
            "kind": "system",
            "code": code,
            "name": name,
            "name_folded": name.casefold(),
            "color": color,
        }
        for code, name, color in missing
    ]
    await session.execute(
        insert(TransactionCategory).values(rows).on_conflict_do_nothing(index_elements=["organisation_id", "code"])
    )
    await session.commit()
