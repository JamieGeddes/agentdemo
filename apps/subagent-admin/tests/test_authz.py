"""Authorization-gate tests — pure logic, no ADK/model needed."""

from app.authz import authorize


def test_admin_is_allowed_to_run_admin_tools():
    assert authorize("change_plan", {"plan": "pro"}, "admin") is None
    assert authorize("rotate_api_key", {}, "admin") is None


def test_manager_gets_a_non_applied_preview():
    r = authorize("set_seats", {"seats": 30}, "manager")
    assert r is not None
    assert r["applied"] is False
    assert "PREVIEW" in r["message"]


def test_readonly_is_denied():
    r = authorize("issue_credit", {"amount_cents": 100}, "readonly")
    assert r is not None
    assert "DENIED" in r["message"]


def test_non_admin_tool_is_passthrough_for_everyone():
    assert authorize("some_read_only_tool", {}, "readonly") is None
