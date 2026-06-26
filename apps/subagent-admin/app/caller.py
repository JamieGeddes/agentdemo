"""Shared-context plumbing for the account-admin subagent.

The caller's identity + role arrive as an ``Authorization: Bearer <token>`` header
(A2A's standard credential channel). ADK does **not** propagate A2A request
metadata into tool/callback context (google/adk-python#3098), so we read the
header ourselves at the HTTP layer and stash the decoded caller in a contextvar.

We use a *pure ASGI* middleware (not Starlette ``BaseHTTPMiddleware``) on purpose:
it runs in the same async context as the downstream agent run, so a contextvar set
here is visible to the tools/callbacks. The token is a simulated, unsigned,
JWT-shaped credential minted by the server (see ``packages/shared/src/token.ts``);
``decode_token`` mirrors that format.
"""

from __future__ import annotations

import base64
import json
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional

ROLES = {"readonly", "manager", "admin"}


@dataclass(frozen=True)
class Caller:
    user_id: str
    user_name: str
    role: str


def _b64url_decode(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def _b64url_encode(obj: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def decode_token(auth: Optional[str]) -> Optional[Caller]:
    """Decode a bearer token (or raw token) into a ``Caller``; ``None`` if invalid."""
    if not auth:
        return None
    raw = auth[7:] if auth.startswith("Bearer ") else auth
    parts = raw.split(".")
    if len(parts) < 2:
        return None
    try:
        payload = json.loads(_b64url_decode(parts[1]))
    except Exception:
        return None
    sub, name, role = payload.get("sub"), payload.get("name"), payload.get("role")
    if not isinstance(sub, str) or not isinstance(name, str) or role not in ROLES:
        return None
    return Caller(user_id=sub, user_name=name, role=role)


def mint_token(user_id: str, name: str, role: str) -> str:
    """Mint a token in the same format the server uses (test/dev convenience)."""
    return (
        f'{_b64url_encode({"alg": "none", "typ": "JWT"})}.'
        f'{_b64url_encode({"sub": user_id, "name": name, "role": role})}.demo'
    )


current_caller: ContextVar[Optional[Caller]] = ContextVar("current_caller", default=None)


def get_caller() -> Optional[Caller]:
    return current_caller.get()


def get_role() -> str:
    """Least-privilege default: an unauthenticated caller is treated as readonly."""
    caller = current_caller.get()
    return caller.role if caller else "readonly"


class CallerMiddleware:
    """Pure-ASGI middleware that decodes the bearer token into ``current_caller``."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        token = current_caller.set(decode_token(headers.get("authorization")))
        try:
            await self.app(scope, receive, send)
        finally:
            current_caller.reset(token)
