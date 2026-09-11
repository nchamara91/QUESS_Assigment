"""The canonical system categories match the contract's ``x-system-categories``."""

from __future__ import annotations

from app.domain.system_categories import SYSTEM_CATEGORY_SPECS, SYSTEM_ORDER

EXPECTED = [
    ("income", "Income", "green"),
    ("payroll", "Payroll", "blue"),
    ("suppliers", "Suppliers", "teal"),
    ("taxes", "Taxes", "red"),
    ("fees", "Fees", "amber"),
    ("software", "Software", "purple"),
    ("travel", "Travel", "orange"),
    ("transfer", "Internal transfer", "slate"),
    ("other", "Other", "slate"),
]


def test_specs_are_exactly_the_nine() -> None:
    assert list(SYSTEM_CATEGORY_SPECS) == EXPECTED


def test_order_is_canonical() -> None:
    assert [SYSTEM_ORDER[code] for code, _, _ in EXPECTED] == list(range(9))
