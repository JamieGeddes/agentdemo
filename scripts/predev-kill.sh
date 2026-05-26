#!/usr/bin/env bash
# Free the dev ports before `npm run dev`.
#
# A session ended without Ctrl-C orphans the child `tsx watch` / `langgraphjs dev`
# processes; they ignore SIGTERM and keep holding their ports, so the next
# `npm run dev` fails with EADDRINUSE (Fastify) / ECONNREFUSED (Vite proxy).
# Run as the npm `predev` hook so cleanup happens automatically.
set -u

# runbooks-mcp, agent/LangGraph, server/Fastify, web/Vite
PORTS="4100 2024 4000 5173"

for port in $PORTS; do
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    # SIGTERM is ignored by the orphaned watchers — go straight to SIGKILL.
    echo "predev: killing stale process on :$port ($(echo "$pids" | tr '\n' ' '))"
    kill -9 $pids 2>/dev/null || true
  fi
done

# Nothing-to-kill is the healthy case; never block the chained `dev`.
exit 0
