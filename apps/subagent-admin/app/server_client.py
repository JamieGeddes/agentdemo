"""Thin async HTTP client over the Fastify REST API.

The subagent's privileged actions persist through these endpoints (the demo's
single SQLite writer), and it records its own activity via POST /api/activity so
the changes surface in the app's activity feed — mirroring how the web client logs
its writes.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx

_TIMEOUT = 10.0


def _api() -> str:
    return os.environ.get("SERVER_API_URL", "http://127.0.0.1:4000")


async def resolve_customer(name_or_id: str) -> Optional[dict]:
    q = name_or_id.strip().lower()
    async with httpx.AsyncClient(base_url=_api(), timeout=_TIMEOUT) as c:
        r = await c.get("/api/customers")
        r.raise_for_status()
        for cust in r.json():
            if cust["id"].lower() == q or q in cust["company"].lower():
                return cust
    return None


async def patch_customer(customer_id: str, patch: dict[str, Any]) -> dict:
    async with httpx.AsyncClient(base_url=_api(), timeout=_TIMEOUT) as c:
        r = await c.patch(f"/api/customers/{customer_id}", json=patch)
        r.raise_for_status()
        return r.json()


async def service_credit(customer_id: str, amount_cents: int) -> dict:
    async with httpx.AsyncClient(base_url=_api(), timeout=_TIMEOUT) as c:
        r = await c.post(f"/api/customers/{customer_id}/service-credit", json={"amountCents": amount_cents})
        r.raise_for_status()
        return r.json()


async def rotate_api_key(customer_id: str) -> dict:
    async with httpx.AsyncClient(base_url=_api(), timeout=_TIMEOUT) as c:
        r = await c.post(f"/api/customers/{customer_id}/rotate-api-key")
        r.raise_for_status()
        return r.json()


async def log_activity(kind: str, summary: str, detail: str) -> None:
    """Best-effort: record the action in the activity feed. Never raises."""
    try:
        async with httpx.AsyncClient(base_url=_api(), timeout=_TIMEOUT) as c:
            await c.post("/api/activity", json={"kind": kind, "summary": summary, "detail": detail})
    except Exception:
        pass
