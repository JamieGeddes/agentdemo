"""ASGI entrypoint: expose the account-admin ADK agent as an A2A server.

Run with: uvicorn app.main:a2a_app --host 127.0.0.1 --port 4300
(``scripts/run-uvicorn.sh`` does this.) The uvicorn ``--host`` controls the bind
(IPv4 127.0.0.1); the ``host``/``port`` passed to ``to_a2a`` only set the URL the
Agent Card advertises — the dummy hostname an operator maps to 127.0.0.1 in
/etc/hosts, simulating a remote agent.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load the repo-root .env (apps/subagent-admin/app/main.py -> parents[3] = repo root)
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from google.adk.a2a.utils.agent_to_a2a import to_a2a  # noqa: E402  (after dotenv)

from .agent import build_agent  # noqa: E402
from .caller import CallerMiddleware  # noqa: E402

_public_host = os.environ.get("ADMIN_PUBLIC_HOST", "account-admin.vela.internal")
_port = int(os.environ.get("ADMIN_PORT", "4300"))

a2a_app = to_a2a(build_agent(), host=_public_host, port=_port, protocol="http")
# Decode the bearer token (shared context) into the contextvar for every request.
a2a_app.add_middleware(CallerMiddleware)
