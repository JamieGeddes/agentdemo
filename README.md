# Vela — Agentic Support Desk (PoC)

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

1. **UI control via frontend tools** — the agent filters/sorts the inbox, opens
   tickets, navigates between pages (Inbox ↔ Customers), and changes
   status/priority by calling `useFrontendTool` handlers that drive the *same*
   state the UI uses.
2. **Generative UI in chat** — the agent renders rich cards inline (ticket
   summary, account health, knowledge citation) via a tool's `render()`.
3. **Human-in-the-loop** — `useHumanInTheLoop` tools (`draftReply`,
   `createTicket`, `changeCustomerPlan`) propose an action and wait for the rep to
   **approve or discard** before anything is sent or persisted.
4. **MCP knowledge lookup** — the agent calls the external DeepWiki MCP server to
   answer technical questions and cites the source.
5. **Readable app context** — the rep's current view (visible tickets, active
   filters, open ticket/customer) is streamed to the agent via `useAgentContext`,
   so Aria acts on what the rep is actually looking at.
6. **Live agent progress (generative UI from agent state)** — a "watch Aria work"
   panel streams the agent's multi-step progress (reading a ticket → searching the
   knowledge base → drafting) from streamed agent state via `useAgent`, distinct
   from the per-tool-call chips.
7. **Contextual suggestions** — next-best-action chips above the chat input adapt to
   the rep's current view (`useConfigureSuggestions`).
8. **Progressive cards** — the summary/citation cards render a skeleton, then fill in
   as the model streams their content.

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
4. **Human-in-the-loop (reply)** — *"Draft a reply for T-1004 apologizing and asking
   them to re-verify the signing secret"* → an approval card appears; **Approve &
   send** posts it to the thread; **Discard** drops it.
5. **Second page + navigation** — *"Show me the customers page"* → the Rail switches
   to the Customers directory. (You can also click the **◍** Rail icon yourself.)
6. **Open + summarize an account** — *"Open Acme Robotics and summarize their
   account"* → Aria navigates to the customer, reads their tickets, and renders an
   account-health card in the chat.
7. **Human-in-the-loop (plan change)** — *"Upgrade Hooli to pro"* → an approval card
   shows the **current → proposed** plan; **Approve & apply** persists it (the plan
   badge updates in the directory); **Discard** leaves it unchanged.
8. **Context awareness** — filter or open something yourself, then ask *"what am I
   looking at?"* → Aria answers from the live view it receives via `useAgentContext`
   (current filters, the open ticket, the open customer).

## Demo script: the generative-UI features

This script shows the three generative-UI capabilities added on top of the basics
above. The DeepWiki-backed tickets are tied to real repos — **T-1001** (fastify),
**T-1002** (langchainjs), **T-1006** (react), **T-1008** (langgraph) — so knowledge
lookups and citation cards look best on those.

### 1. Live "watch Aria work" panel

A floating panel (bottom-right) streams the step timeline while Aria works, then
clears once the run settles — so kick off a **multi-step** request to see it:

- *"Open T-1001, look up how to enable CORS in Fastify, and draft a reply to the
  customer."* — the longest timeline: navigate → read → DeepWiki → cite → draft.
- *"Investigate T-1002 — read the ticket, check the LangChain docs about streaming
  timeouts, and summarize the issue."*
- *"Read T-1008 and find the right way to connect a remote MCP server to a LangGraph
  agent."*
- *"Show me the urgent open tickets, then read the most pressing one and summarize it."*

### 2. Contextual suggestion chips

Chips above the chat input change with the rep's current view. Run these in sequence
and watch them update (then **click a chip** to show it fires a real prompt):

- Fresh inbox, nothing open → **Triage urgent**, **Oldest first**.
- *"Open T-1003"* (or click any ticket) → **Summarize**, **Draft reply**, **Find similar docs**.
- *"Show customers"* → **List customers**, **Enterprise accounts**.
- *"Open Acme Robotics"* → **Account summary**, **Open tickets**, **Plan**.

### 3. Progressive (skeleton → fill) cards

The card renders a shimmer skeleton, then fills in as the model streams — most visible
on longer answers:

- *"Summarize ticket T-1006."* → ticket summary card.
- *"Summarize Umbrella Health's account."* → account-health card.
- *"How do I rotate API keys without downtime?"* → knowledge citation card (the longest
  stream, so the clearest skeleton).

### Kitchen-sink finale (all three in one turn)

- *"Open T-1002, read it, look up how LangChain handles streaming and timeouts,
  summarize the root cause as a card, and draft a reply to Tom."* — streams the
  progress panel, renders a citation + summary card, and ends in a reply approval.

## Test

```bash
npm test         # Vitest across shared / server / agent / web (no API key needed —
                 # the model is mocked, so tests are deterministic and offline)
npm run typecheck
```

## How the pieces connect

- **`apps/server/src/copilot.ts`** mounts the CopilotKit **v2 (AG-UI)** runtime on
  Fastify via `createCopilotRuntimeHandler` and proxies to the LangGraph agent via
  `LangGraphAgent({ deploymentUrl, graphId })`. Fastify already JSON-parses the
  body, so it hands the fetch handler a reconstructed Web `Request` and streams
  the `Response` back (keeps AG-UI SSE streaming intact). Uses **single-route mode**
  (see note below).
- **`apps/agent/src/graph.ts`** is LangChain's prebuilt agent (`createAgent`) with
  `copilotkitMiddleware`, driven by Gemini Flash. It binds the backend tools
  (ticket/customer reads + DeepWiki MCP); the CopilotKit **frontend tools** are
  injected by the middleware and routed to the browser to execute. A small
  `mergeSystemMessages` middleware folds the agent context + system prompt into a
  single system message (Gemini requires exactly one, first).
- **`apps/web/src/copilot/actions.tsx`** registers the readable context
  (`useAgentContext`), the frontend tools (UI control), the generative-UI cards,
  the human-in-the-loop approvals (`useHumanInTheLoop`), and a compact activity
  chip for backend tool calls.

## Notes & limitations

- **Single-route mode is required.** The server runs the v2 runtime with
  `mode: "single-route"` and the client sets `useSingleEndpoint`. In the default
  multi-route mode, a frontend-tool call's two-run pause/resume clears the chat
  transcript in the v2 client; single-route mode renders it correctly. Both must
  match.
- The agent's UI changes go through **frontend tools** (so the rep sees them in the
  UI) and persist via the REST API to SQLite.
- The DeepWiki MCP connection degrades gracefully: if it's unreachable the agent
  still works on local tickets.
- This is a PoC: in-process dev servers, seeded demo data, and a single graph.
  Production would use a deployed LangGraph runtime, auth, and real persistence.
