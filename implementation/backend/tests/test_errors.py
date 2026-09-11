"""The validation map: Pydantic errors become contract issue codes."""

from __future__ import annotations

from pydantic_core import ErrorDetails

from app.errors import validation_body


def _error(**kwargs: object) -> ErrorDetails:
    return ErrorDetails(**kwargs)  # type: ignore[typeddict-item]


def test_missing_and_blank_names() -> None:
    body = validation_body(
        [
            _error(type="missing", loc=("body", "name"), msg="Field required"),
            _error(type="blank", loc=("body", "name"), msg="Name must not be blank."),
        ]
    )
    assert body["type"] == "ValidationError"
    assert [issue["code"] for issue in body["error"]["name"]] == ["required", "blank"]


def test_list_constraints_and_item_patterns() -> None:
    body = validation_body(
        [
            _error(type="too_long", loc=("query", "transaction_id"), msg="Too many items"),
            _error(type="string_pattern_mismatch", loc=("query", "transaction_id", 2), msg="Bad pattern"),
        ]
    )
    codes = [issue["code"] for issue in body["error"]["transaction_id"]]
    assert codes == ["too_many_items", "invalid_format"]


def test_model_level_errors_go_to_non_field_errors() -> None:
    body = validation_body([_error(type="empty", loc=("body",), msg="Empty")])
    assert body["error"] == {"non_field_errors": [{"code": "empty", "message": "Empty"}]}


def test_extra_fields_are_reported_on_their_own_key() -> None:
    body = validation_body([_error(type="extra_forbidden", loc=("body", "kind"), msg="Extra inputs are not permitted")])
    assert "kind" in body["error"]
