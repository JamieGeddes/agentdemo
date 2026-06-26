"""Deterministic authorization gate for the account-admin tools.

Pure logic (no ADK import) so it is unit-testable without the model/runtime. The
agent wires this into ADK's ``before_tool_callback``: returning ``None`` allows the
tool to run; returning a dict short-circuits it with that dict as the tool result.
All account mutations are admin-only — managers get a non-applied preview, readonly
is denied. This is the enforcement point; the LLM only chooses which tool to call.
"""

from __future__ import annotations

from typing import Any, Optional

ADMIN_ONLY = {"change_plan", "set_seats", "issue_credit", "rotate_api_key"}


def authorize(tool_name: str, args: dict[str, Any], role: str) -> Optional[dict]:
    if tool_name not in ADMIN_ONLY:
        return None
    if role == "admin":
        return None
    if role == "manager":
        return {
            "status": "preview",
            "applied": False,
            "message": (
                f"PREVIEW (not applied): '{tool_name}' with {args} would change account state, "
                "but applying it requires an admin."
            ),
        }
    return {
        "status": "denied",
        "applied": False,
        "message": f"DENIED: '{tool_name}' requires admin privileges; you are signed in as '{role}'.",
    }
