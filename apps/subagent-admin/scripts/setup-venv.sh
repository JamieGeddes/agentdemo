#!/usr/bin/env bash
# Create the Python virtualenv for the account-admin subagent and install deps.
# Kept OUT of `npm install`/postinstall so installing the JS monorepo never
# requires Python. Run explicitly: `npm run setup:admin`.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "[subagent-admin] $PY not found — install Python >= 3.10" >&2
  exit 1
fi

"$PY" -m venv .venv
.venv/bin/python -m pip install --upgrade pip >/dev/null
.venv/bin/python -m pip install -r requirements.txt
echo "[subagent-admin] venv ready at $here/.venv"
