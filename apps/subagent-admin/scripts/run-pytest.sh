#!/usr/bin/env bash
# Run the Python unit tests (authz + token decode). Skips cleanly if the venv
# hasn't been created, so it never breaks a JS-only checkout.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

if [ ! -d .venv ]; then
  echo "[subagent-admin] venv missing — skipping pytest (run 'npm run setup:admin' to enable)"
  exit 0
fi

exec .venv/bin/python -m pytest -q
