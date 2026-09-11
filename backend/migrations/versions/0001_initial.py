"""Initial categories and assignments.

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-11
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transaction_categories",
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=True),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("name_folded", sa.String(length=40), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("category_id", name="pk_transaction_categories"),
        # The unique index that makes concurrent duplicates impossible.
        sa.UniqueConstraint("organisation_id", "name_folded", name="uq_category_org_name_folded"),
        sa.UniqueConstraint("organisation_id", "code", name="uq_category_org_code"),
    )
    op.create_index("ix_transaction_categories_organisation_id", "transaction_categories", ["organisation_id"])

    op.create_table(
        "transaction_category_assignments",
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transaction_id", sa.String(length=36), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_by", sa.String(length=128), nullable=True),
        sa.PrimaryKeyConstraint("organisation_id", "transaction_id", name="pk_transaction_category_assignments"),
        # Deleting a category uncategorises every transaction that carried it.
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["transaction_categories.category_id"],
            name="fk_assignments_category_id",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("transaction_category_assignments")
    op.drop_index("ix_transaction_categories_organisation_id", table_name="transaction_categories")
    op.drop_table("transaction_categories")
