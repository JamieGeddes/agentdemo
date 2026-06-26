#!/usr/bin/env bash
# Run all four dev servers under `concurrently`, with reliable teardown.
#
# `concurrently` forwards Ctrl-C to its direct children, but the grandchild
# `tsx watch` / `langgraphjs dev` server processes can survive and keep holding
# their ports. We pre-clean stale listeners, then trap exit to SIGKILL anything
# still bound to the dev ports — so Ctrl-C actually frees :4100/:2024/:4000/:5173.
set -u
here="$(cd "$(dirname "$0")" && pwd)"

cleanup() { bash "$here/free-ports.sh"; }
trap cleanup EXIT INT TERM

bash "$here/free-ports.sh"   # clear anything left over from a previous run

# The Python account-admin subagent needs a venv (npm run setup:admin). Warn but
# don't abort — the other five services and graceful A2A degradation still work.
if [ ! -d "$here/../apps/subagent-admin/.venv" ]; then
  echo "dev.sh: apps/subagent-admin/.venv missing — run 'npm run setup:admin' to enable the account-admin subagent." >&2
fi

npx --no-install concurrently \
  -n runbooks,agent,server,web,insights,admin \
  -c yellow,magenta,cyan,green,blue,red \
  "npm:dev:runbooks" "npm:dev:agent" "npm:dev:server" "npm:dev:web" "npm:dev:insights" "npm:dev:admin"
