"""The account-admin ADK agent: an LlmAgent whose tools perform privileged account
actions, gated by a deterministic ``before_tool_callback``."""

from __future__ import annotations

import os

from google.adk.agents import LlmAgent

from . import server_client as api
from .authz import authorize
from .caller import get_caller, get_role

INSTRUCTION = """You are the "Account Admin" agent — a specialist reached over A2A by Aria, the support-desk copilot.
You perform privileged account administration: change a customer's plan or seat count, issue a service
credit, and rotate a customer's API key. Identify the customer by company name or id.

These actions are admin-only and the system enforces it BEFORE each tool runs:
- If a tool result says "DENIED", the caller lacks permission — relay that plainly and do NOT retry.
- If it says "PREVIEW (not applied)", the caller is a manager who may preview but not apply — relay what
  would happen and that an admin must apply it.
Be precise and concise; you are talking to another agent, not an end user."""


async def change_plan(customer: str, plan: str) -> dict:
    """Change a customer's subscription plan.

    Args:
        customer: Company name or customer id (e.g. "Acme Robotics" or "c1").
        plan: New plan — one of "free", "pro", "enterprise".
    """
    cust = await api.resolve_customer(customer)
    if not cust:
        return {"error": f"No customer matching '{customer}'."}
    updated = await api.patch_customer(cust["id"], {"plan": plan})
    await api.log_activity("plan", f"{cust['company']} plan → {plan}", f"by {_actor()} (account-admin agent)")
    return {"ok": True, "company": cust["company"], "plan": updated.get("plan")}


async def set_seats(customer: str, seats: int) -> dict:
    """Set the number of paid seats on a customer's account.

    Args:
        customer: Company name or customer id.
        seats: New seat count (non-negative integer).
    """
    cust = await api.resolve_customer(customer)
    if not cust:
        return {"error": f"No customer matching '{customer}'."}
    updated = await api.patch_customer(cust["id"], {"seats": seats})
    await api.log_activity("seats", f"{cust['company']} seats → {seats}", f"by {_actor()} (account-admin agent)")
    return {"ok": True, "company": cust["company"], "seats": updated.get("seats")}


async def issue_credit(customer: str, amount_cents: int) -> dict:
    """Issue a one-off service credit to a customer.

    Args:
        customer: Company name or customer id.
        amount_cents: Credit amount in cents (positive integer), e.g. 20000 for $200.
    """
    cust = await api.resolve_customer(customer)
    if not cust:
        return {"error": f"No customer matching '{customer}'."}
    res = await api.service_credit(cust["id"], amount_cents)
    dollars = amount_cents / 100
    await api.log_activity("credit", f"${dollars:.2f} credit issued to {cust['company']}", f"by {_actor()} (account-admin agent)")
    return {"ok": True, "company": cust["company"], "amountCents": amount_cents, "creditId": res.get("creditId")}


async def rotate_api_key(customer: str) -> dict:
    """Rotate (regenerate) a customer's API key.

    Args:
        customer: Company name or customer id.
    """
    cust = await api.resolve_customer(customer)
    if not cust:
        return {"error": f"No customer matching '{customer}'."}
    res = await api.rotate_api_key(cust["id"])
    await api.log_activity("apikey", f"API key rotated for {cust['company']}", f"by {_actor()} (account-admin agent)")
    return {"ok": True, "company": cust["company"], "keyId": res.get("keyId")}


def _actor() -> str:
    caller = get_caller()
    return caller.user_name if caller else "unknown"


def _before_tool(tool, args, tool_context):  # noqa: ARG001 - ADK callback signature
    """ADK before_tool_callback: enforce the authz gate using the request's caller."""
    return authorize(tool.name, args, get_role())


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="account_admin",
        model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        description=(
            "Performs privileged account administration for the support desk: change a customer's plan or "
            "seat count, issue a service credit, and rotate a customer's API key. Admin-only actions."
        ),
        instruction=INSTRUCTION,
        tools=[change_plan, set_seats, issue_credit, rotate_api_key],
        before_tool_callback=_before_tool,
    )
