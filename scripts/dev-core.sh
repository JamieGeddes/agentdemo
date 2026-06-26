#!/usr/bin/env bash
# Run the CORE app WITHOUT the A2A subagents: runbooks-mcp, the main agent, the
# server, and the web app. The main agent comes up with an EMPTY subagent registry
# (list_subagents returns nothing). Start `npm run dev:subagents` later in another
# terminal to demo dynamic registration — the already-running agent discovers them
# on its next background refresh, no restart.
#
# Frees only the core ports on teardown, so it never kills running subagents.
set -u
here="$(cd "$(dirname "$0")" && pwd)"

PORTS="4100 2024 4000 5173"   # runbooks, agent, server, web — NOT 4200/4300

# Snappier refresh so the live pickup is quick to demo (export to override).
export A2A_REFRESH_MS="${A2A_REFRESH_MS:-8000}"

cleanup() { bash "$here/free-ports.sh" $PORTS; }
trap cleanup EXIT INT TERM

bash "$here/free-ports.sh" $PORTS   # clear stale core listeners; leave any subagents alone

npx --no-install concurrently -n runbooks,agent,server,web -c yellow,magenta,cyan,green \
  "npm:dev:runbooks" "npm:dev:agent" "npm:dev:server" "npm:dev:web"
