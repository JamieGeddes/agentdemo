# Helm — Agentic Support Desk (PoC)

A proof of concept showing how an **agentic layer** can be grafted onto an
existing B2B support/ticketing app *as seamlessly as possible*. The agent
("Aria") lives in a sidebar inside the real product and can drive the UI, render
rich answers in chat, pause for human approval, and pull in external knowledge —
without replacing the app it lives in.

## Stack

| Concern | Tech |
| --- | --- |
| Front end | React + Vite, **CopilotKit** chat sidebar (AG-UI protocol) |
| App API | **Fastify** (TypeScript) REST + **SQLite** (`better-sqlite3`) |
| Agent | Standalone **LangGraph (JS)** graph, **Gemini Flash** via **LangChain** |
| External tools | **DeepWiki** remote **MCP** server (streamable HTTP, no auth) |
| Tests | **Vitest** across all workspaces |

```
apps/web     React UI + CopilotKit  ──/api/copilotkit──┐
apps/server  Fastify: REST + CopilotKit runtime  ──────┘──> apps/agent (LangGraph dev server :2024)
                 │                                              │ Gemini (LangChain) + tools
                 └── SQLite (apps/server/data/support.db)       ├── server tools → Fastify REST
                                                                └── MCP tools → DeepWiki (remote)
```

## What it demonstrates

1. **UI control via frontend actions** — the agent filters/sorts the inbox, opens
   tickets, and changes status/priority by calling `useCopilotAction` handlers
   that drive the *same* state the UI uses.
2. **Generative UI in chat** — the agent renders rich cards inline (ticket
   summary, knowledge citation) via action `render()`.
3. **Human-in-the-loop** — `draftReply` proposes a customer reply and waits for
   the rep to **approve or discard** before anything is sent.
4. **MCP knowledge lookup** — the agent calls the external DeepWiki MCP server to
   answer technical questions and cites the source.
5. **Shared agent state** — the agent's active ticket and research notes stream
   into the chat live via `useCoAgent` / `useCoAgentStateRender`.

## Prerequisites

- Node ≥ 20 (tested on Node 22)
- A **Gemini API key** — required only to run the agent's LLM loop.
  Get one at <https://aistudio.google.com/apikey>.

## Setup

```bash
npm install
cp .env.example .env        # then edit .env and set GOOGLE_API_KEY=...
```

Key settings in `.env`: `GOOGLE_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`),
and the ports/URLs (`SERVER_PORT=4000`, `AGENT_PORT=2024`, `WEB_PORT=5173`).

## Run

```bash
npm run dev      # starts all three: agent (:2024), server (:4000), web (:5173)
```

Then open <http://localhost:5173>. The SQLite database is created and seeded
automatically on first run.

> Processes can also be started individually: `npm run dev:agent`,
> `npm run dev:server`, `npm run dev:web`.

## Try it (demo script)

With all three running, talk to Aria in the sidebar:

1. **UI control** — *"Show me all urgent open tickets"* → the inbox filters live.
   Then *"Open T-1001"* → the detail view opens (the row flashes).
2. **Generative UI** — *"Summarize T-1001 for me"* → a structured summary card
   renders in the chat.
3. **MCP lookup** — *"How do I enable CORS in Fastify?"* (T-1001's topic) → the
   agent queries DeepWiki and replies with a cited card.
4. **Human-in-the-loop** — *"Draft a reply for T-1004 apologizing and asking them
   to re-verify the signing secret"* → an approval card appears; **Approve & send**
   posts it to the thread; **Discard** drops it.
5. **Shared state** — while Aria works, the "Agent working state" panel in the
   chat shows the active ticket and any knowledge lookups.

## Test

```bash
npm test         # Vitest across shared / server / agent / web (no API key needed —
                 # the model is mocked, so tests are deterministic and offline)
npm run typecheck
```

## How the pieces connect

- **`apps/server/src/copilot.ts`** mounts the CopilotKit runtime on Fastify and
  proxies AG-UI traffic to the LangGraph agent via `LangGraphAgent({ deploymentUrl, graphId })`.
  Fastify already JSON-parses the body, so it hands the handler a reconstructed
  Web `Request` and streams the `Response` back (keeps AG-UI streaming intact).
- **`apps/agent/src/graph.ts`** binds three tool sets to Gemini: backend read
  tools, DeepWiki MCP tools, and the CopilotKit **frontend actions** injected at
  runtime. Backend tool calls run in the graph (and update shared state); a
  frontend-action call ends the run so the **browser** executes it against the
  live UI.
- **`apps/web/src/copilot/actions.tsx`** registers the readable state, frontend
  actions, generative-UI cards, the HITL approval flow, and the shared-state HUD.

## Notes & limitations

- Writes the agent makes to tickets go through **frontend actions** (so the rep
  sees them happen in the UI) and persist via the REST API to SQLite.
- The DeepWiki MCP connection degrades gracefully: if it's unreachable the agent
  still works on local tickets.
- This is a PoC: in-process dev servers, seeded demo data, and a single graph.
  Production would use a deployed LangGraph runtime, auth, and real persistence.
```
