#!/usr/bin/env bash
# Run ONLY the A2A subagents (insights :4200, account-admin :4300). Start this AFTER
# `npm run dev:core` to demo dynamic registration: the already-running main agent
# discovers them on its next background refresh (A2A_REFRESH_MS) — no restart.
#
# Frees only the subagent ports on teardown, so stopping it leaves the core app up.
set -u
here="$(cd "$(dirname "$0")" && pwd)"

PORTS="4200 4300"   # only the subagent ports

if [ ! -d "$here/../apps/subagent-admin/.venv" ]; then
  echo "dev-subagents.sh: apps/subagent-admin/.venv missing — run 'npm run setup:admin' first for the account-admin subagent." >&2
fi

cleanup() { bash "$here/free-ports.sh" $PORTS; }
trap cleanup EXIT INT TERM

bash "$here/free-ports.sh" $PORTS

npx --no-install concurrently -n insights,admin -c blue,red \
  "npm:dev:insights" "npm:dev:admin"
