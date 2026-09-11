"""Domain tables.

Two invariants live in the database rather than in application code:

* category names are unique per organisation *case-insensitively* — enforced by
  a unique constraint on the precomputed ``name_folded`` column, so two
  concurrent creates cannot both succeed;
* deleting a custom category uncategorises every transaction that carried it —
  enforced by ``ON DELETE CASCADE`` on the assignment foreign key.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TransactionCategory(Base):
    """A system or custom category of one organisation."""

    __tablename__ = "transaction_categories"
    __table_args__ = (
        UniqueConstraint("organisation_id", "name_folded", name="uq_category_org_name_folded"),
        UniqueConstraint("organisation_id", "code", name="uq_category_org_code"),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    # Unicode case folding of ``name``; the unique index on this column is what
    # makes "Zürich" and "ZÜRICH" collide.
    name_folded: Mapped[str] = mapped_column(String(40), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class TransactionCategoryAssignment(Base):
    """The single category (or none) a transaction carries for one organisation."""

    __tablename__ = "transaction_category_assignments"

    organisation_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    transaction_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("transaction_categories.category_id", ondelete="CASCADE"),
        nullable=True,
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
