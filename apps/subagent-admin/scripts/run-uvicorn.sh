#!/usr/bin/env bash
# Run the account-admin A2A server. Binds IPv4 127.0.0.1 (matching the rest of the
# dev wiring); the Agent Card advertises the dummy hostname (set in app/main.py).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

if [ ! -d .venv ]; then
  echo "[subagent-admin] venv missing — run 'npm run setup:admin' first" >&2
  exit 1
fi

exec .venv/bin/uvicorn app.main:a2a_app --host "${ADMIN_HOST:-127.0.0.1}" --port "${ADMIN_PORT:-4300}"
