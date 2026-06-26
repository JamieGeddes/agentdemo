#!/usr/bin/env bash
# Free the four dev ports by SIGKILLing whatever is listening on them.
#
# Used by scripts/dev.sh both before starting (clear stale listeners) and on exit
# (teardown). Child `tsx watch` / `langgraphjs dev` processes can survive Ctrl-C
# and keep holding their ports, so the next `npm run dev` fails with EADDRINUSE
# (Fastify) / ECONNREFUSED (Vite proxy). SIGTERM is ignored by these orphans, so
# we go straight to SIGKILL.
set -u

# Ports to free. With no args, frees ALL dev ports; pass a subset to free only those
# — so `dev:core` and `dev:subagents` can tear down independently without killing each
# other. Ports: runbooks 4100 · agent 2024 · server 4000 · web 5173 · insights 4200 · admin 4300
PORTS="${*:-4100 2024 4000 5173 4200 4300}"

for port in $PORTS; do
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "free-ports: killing process on :$port ($(echo "$pids" | tr '\n' ' '))"
    kill -9 $pids 2>/dev/null || true
  fi
done

# Nothing-to-kill is the healthy case; never block the caller.
exit 0
