#!/usr/bin/env bash
# Free the four dev ports by SIGKILLing whatever is listening on them.
#
# Used by scripts/dev.sh both before starting (clear stale listeners) and on exit
# (teardown). Child `tsx watch` / `langgraphjs dev` processes can survive Ctrl-C
# and keep holding their ports, so the next `npm run dev` fails with EADDRINUSE
# (Fastify) / ECONNREFUSED (Vite proxy). SIGTERM is ignored by these orphans, so
# we go straight to SIGKILL.
set -u

# runbooks-mcp, agent/LangGraph, server/Fastify, web/Vite
PORTS="4100 2024 4000 5173"

for port in $PORTS; do
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "free-ports: killing process on :$port ($(echo "$pids" | tr '\n' ' '))"
    kill -9 $pids 2>/dev/null || true
  fi
done

# Nothing-to-kill is the healthy case; never block the caller.
exit 0
