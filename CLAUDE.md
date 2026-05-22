## What this is

"Vela" — a PoC showing an **agentic layer** ("Aria") grafted into an existing B2B
support/ticketing app. The agent lives in a chat sidebar inside the real product
and can drive the UI, render rich cards in chat, pause for human approval, and
pull in external knowledge. It is a demo: in-process dev servers, seeded data, a
single graph. See `spec.md` for the original brief and `README.md` for the demo
script.

## Commands

```bash
npm install                  # one install for the whole workspace
cp .env.example .env         # then set GOOGLE_API_KEY (only needed to run the agent live)

npm run dev                  # starts all three: agent (:2024), server (:4000), web (:5173)
npm run dev:agent            # langgraphjs dev server only
npm run dev:server           # Fastify only (tsx watch)
npm run dev:web              # Vite only

npm test                     # Vitest across all 4 workspaces (model is MOCKED — no API key, offline, deterministic)
npm run test:watch
npx vitest run apps/agent    # run one workspace's tests
npx vitest run apps/server/src/ticketStore.test.ts   # run one file
npm run typecheck            # tsc across shared + all three apps
npm run build                # tsc/vite build across workspaces
```

Open <http://localhost:5173> after `npm run dev`; SQLite is created and seeded on
first run at `apps/server/data/support.db`.

## Layout (npm workspaces monorepo)

- `packages/shared` (`@agentdemo/shared`) — domain types, type guards, seed data.
  Imported as **TypeScript source** (`main`/`types` → `src/index.ts`), so changes
  are picked up without a build step. Re-exported enums like `TICKET_STATUSES` /
  `TICKET_PRIORITIES` are the single source of truth for the tool/UI schemas.
- `apps/server` (`@agentdemo/server`) — Fastify REST API + SQLite
  (`better-sqlite3`), and it mounts the CopilotKit runtime that proxies to the agent.
- `apps/agent` (`@agentdemo/agent`) — standalone **LangGraph JS** graph (Gemini
  Flash via LangChain). Run by `langgraphjs dev`, NOT in-process with the server.
- `apps/web` (`@agentdemo/web`) — React + Vite + the CopilotKit chat sidebar.

## Architecture / data flow

```
browser ──/api (Vite proxy)──> Fastify (:4000) ─┬─ REST /api/tickets ── SQLite
                                                 └─ /api/copilotkit (CopilotKit v2 runtime)
                                                        │ LangGraphAgent(deploymentUrl)
                                                        ▼
                                      LangGraph dev server (:2024) — Gemini + tools
                                              ├─ server tools → Fastify REST
                                              └─ MCP tools → DeepWiki (remote, no auth)
```

The browser only ever talks to its own origin; Vite proxies `/api/*` to Fastify
(`apps/web/vite.config.ts`), so REST and the CopilotKit endpoint are same-origin
in dev. The LLM loop lives entirely in the separate LangGraph process; the
Fastify runtime is a bridge, not the brain.

### The two kinds of tools (important)

- **Backend tools** (`apps/agent/src/tools/`) run inside the graph: `list_tickets`,
  `get_ticket` (read-only, hit the Fastify REST API), plus the DeepWiki MCP tools.
- **Frontend tools** (`apps/web/src/copilot/actions.tsx`) run in the browser:
  `filterTickets`, `openTicket`, `setTicketStatus`, `setTicketPriority`
  (UI control + persistence), `showTicketSummary` / `showKnowledgeCitation`
  (generative-UI cards via `render()`), and `draftReply` (human-in-the-loop via
  `useHumanInTheLoop`). They are surfaced to the model by `copilotkitMiddleware`
  and their calls are routed back to the browser to execute.

Design rule: **reads happen server-side; writes go through frontend tools** so the
rep visibly sees the agent act in the UI (writes still persist to SQLite via REST).

## Things that will bite you

- **CopilotKit v2 / single-route mode is mandatory and both ends must match.**
  Server: `mode: "single-route"` in `apps/server/src/copilot.ts`. Client:
  `useSingleEndpoint` in `apps/web/src/App.tsx`. In the default multi-route mode a
  frontend-tool call's two-run pause/resume **clears the chat transcript** in the
  v2 client. Don't switch modes on one side only.
- **Use the `/v2` import subpaths.** Deps are on the 1.57.x line but the code uses
  the v2 (AG-UI) API: `@copilotkit/runtime/v2`, `@copilotkit/react-core/v2`,
  `@copilotkit/sdk-js/langgraph`. Importing the v1 surface will not render agent turns.
- **The graph is `createAgent` + `copilotkitMiddleware`**, not a hand-rolled
  StateGraph (`apps/agent/src/graph.ts`). The hand-rolled version never rendered
  tool-call turns; don't reintroduce it.
- **`useAgentContext` works, but only because of `mergeSystemMessages`.** Under
  `createAgent` it injects an extra system message, which alongside the
  `systemPrompt` makes two — and Gemini errors ("System message should be the
  first one") on more than one. The `mergeSystemMessages` middleware
  (`apps/agent/src/graph.ts`) folds every system message into one leading message
  just before the model call, so the context (3 `useAgentContext` calls in
  `actions.tsx`) works. Any new prompt-visible state hits the same constraint;
  reuse that middleware pattern.
- **Custom agent state → generative UI via `useAgent`.** The `ariaProgress`
  middleware owns an `aria_steps` field (wrapped in `zodState`, which is what
  makes it serialize into the graph `output_schema` and the AG-UI STATE_SNAPSHOT)
  and updates it from the `beforeModel`/`afterModel`/`afterAgent` hooks — NOT
  `wrapToolCall`, which can't return a state patch. The web `AriaProgressPanel`
  reads `useAgent().agent.state.aria_steps` to stream a live "watch Aria work"
  timeline. Detect tool calls by duck-typing `message.tool_calls`, not
  `instanceof AIMessage` (the instance can be from a different `@langchain/core`).
- **The Fastify→runtime bridge re-serializes the body.** Fastify already JSON-parses
  the request, so `copilot.ts` reconstructs a Web `Request`, calls the fetch
  handler, and pipes the `Response` back (with `flushHeaders()`) to preserve SSE
  streaming. Keep that flush — it matters for the frontend-tool resume flow.
- **The agent graph id / web agentId is `support_agent`** (wired in
  `apps/agent/langgraph.json`, `AGENT_GRAPH_ID` env, and `App.tsx`). Keep them in sync.
- **DeepWiki MCP degrades gracefully** (`apps/agent/src/tools/mcp.ts`): unreachable
  ⇒ returns `[]` after a 10s timeout so the agent still works on local tickets.

## Tests

Each workspace ships its own `vitest.config.ts` (node env for shared/server/agent,
jsdom for web); the root `vitest.workspace.ts` aggregates them. The agent tests
**inject a mock model** via `buildAgent({ model })`, and the server tests run
against an in-memory SQLite DB (`buildServer({ dbFile: ":memory:" })` — also
selected automatically when `NODE_ENV=test`). So `npm test` needs no API key and
no running services.

## Config / env

All env is read from the **repo-root `.env`** (each app's `src/env.ts` resolves up
to it; `langgraph.json` also points there). Keys: `LLM_BACKEND`, `GOOGLE_API_KEY`,
`GEMINI_MODEL` (default `gemini-2.5-flash`), `SERVER_PORT`/`AGENT_PORT`/`WEB_PORT`,
`AGENT_URL`, `AGENT_GRAPH_ID`, `SERVER_API_URL`, `DEEPWIKI_MCP_URL`.

`LLM_BACKEND` selects the Gemini backend in `makeModel()` (`apps/agent/src/graph.ts`):
`gemini-api` (default — uses `GOOGLE_API_KEY` via `ChatGoogleGenerativeAI`) or
`vertex` (Vertex AI via `ChatVertexAI`). Vertex authenticates with **Application
Default Credentials** — `gcloud auth application-default login` locally, or the
service account on GCP; no key in `.env`. Vertex-only vars: `GOOGLE_CLOUD_PROJECT`
(defaults to the ADC project), `GOOGLE_CLOUD_LOCATION` (default `europe-west1`).
