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

npm run dev                  # starts all six: runbooks-mcp (:4100), agent (:2024), server (:4000), web (:5173), insights (:4200), admin (:4300)
npm run dev:core             # the app WITHOUT subagents (runbooks+agent+server+web) — registry starts empty; sets A2A_REFRESH_MS=8000
npm run dev:subagents        # ONLY the subagents (insights+admin) — start AFTER dev:core to demo dynamic registration (no main-agent restart)
npm run dev:agent            # langgraphjs dev server only
npm run dev:server           # Fastify only (tsx watch)
npm run dev:web              # Vite only
npm run dev:runbooks         # internal-runbooks MCP server only (tsx watch)
npm run dev:insights         # Insights A2A subagent only (TS/LangGraph, :4200)
npm run dev:admin            # Account-admin A2A subagent only (Python/ADK uvicorn, :4300)
npm run setup:admin          # one-time: create the Python venv for the account-admin subagent (needs Python >=3.10)
npm run reset                # wipe + re-seed the SQLite DB back to defaults (undo a demo session)

npm test                     # Vitest across all workspaces (model is MOCKED — no API key, offline, deterministic)
npm run test:watch
npx vitest run apps/agent    # run one workspace's tests
npx vitest run apps/server/src/ticketStore.test.ts   # run one file
npm run typecheck            # tsc across shared + all apps
npm run build                # tsc/vite build across workspaces
```

Open <http://localhost:5173> after `npm run dev`; SQLite is created and seeded on
first run at `apps/server/data/support.db`. **Writes persist across restarts** (the
seeder only runs when the DB is empty). To undo a demo session, use the **Reset demo**
button on the nav rail (`POST /api/reset` → re-seeds + reloads) or `npm run reset` (CLI).

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
- `apps/runbooks-mcp` (`@agentdemo/runbooks-mcp`) — a local **MCP server** (streamable
  HTTP, stateless) serving internal product/operational runbooks the public DeepWiki
  can't (webhook HMAC, billing seats, API-key rotation). Loaded by the agent alongside
  DeepWiki; degrades gracefully if down.
- `apps/subagent-insights` (`@agentdemo/subagent-insights`) — an **A2A** subagent
  (TypeScript + LangGraph + `@a2a-js/sdk`, :4200) for SLA/queue/customer reporting.
  Its tools tier their output by the caller's role.
- `apps/subagent-admin` (`@agentdemo/subagent-admin`) — an **A2A** subagent in
  **Python + Google ADK** (`to_a2a()` under uvicorn, :4300) for privileged account
  actions (seats / service credit / API-key rotation). NOT an npm package: its
  `package.json` scripts shell out to a Python venv (`npm run setup:admin`); it has its
  own `pytest` suite (run via `npm run test --workspace apps/subagent-admin`), separate
  from the root Vitest. The main agent discovers both from the repo-root `a2a-agents.json`
  manifest and degrades gracefully if either is down.

## Architecture / data flow

```
browser ──/api (Vite proxy)──> Fastify (:4000) ─┬─ REST /api/tickets ── SQLite
                                                 └─ /api/copilotkit (CopilotKit v2 runtime)
                                                        │ LangGraphAgent(deploymentUrl)
                                                        ▼
                                      LangGraph dev server (:2024) — Gemini + tools
                                              ├─ server tools → Fastify REST
                                              ├─ MCP tools → DeepWiki (remote, no auth)
                                              │           └→ runbooks-mcp (:4100, local)
                                              └─ A2A delegation tools (Authorization: Bearer)
                                                   ├→ insights-agent.vela.internal:4200  (TS/LangGraph)
                                                   └→ account-admin.vela.internal:4300   (Python/ADK) → Fastify REST
```

The signed-in session (user + simulated token) flows browser → agent as structured
`forwardedProps.config.configurable.session` (NOT through the LLM); the agent presents the
token as the A2A bearer credential, and each subagent decodes it to authorize by role.
Subagents are discovered from the repo-root `a2a-agents.json` manifest; the dummy
`*.vela.internal` hostnames map to 127.0.0.1 via `/etc/hosts`.

The browser only ever talks to its own origin; Vite proxies `/api/*` to Fastify
(`apps/web/vite.config.ts`), so REST and the CopilotKit endpoint are same-origin
in dev. The LLM loop lives entirely in the separate LangGraph process; the
Fastify runtime is a bridge, not the brain.

### The two kinds of tools (important)

- **Backend tools** (`apps/agent/src/tools/`) run inside the graph: `list_tickets`,
  `get_ticket`, `list_customers`, `list_agents`, `list_activity` (read-only, hit the
  Fastify REST API), plus the MCP tools — DeepWiki (`ask_question`, …) and the local
  runbooks server (`search_runbooks`, `read_runbook`), loaded via independent clients
  in `mcp.ts` so one being down can't take out the other.
- **Frontend tools** (`apps/web/src/copilot/actions.tsx`) run in the browser:
  `filterTickets`, `openTicket`, `navigateTo`, `openCustomer`, `setTicketStatus`,
  `setTicketPriority`, `assignTicket` (UI control + persistence); `showTicketSummary` /
  `showCustomerSummary` / `showKnowledgeCitation` / `showTriageBoard` /
  `showRelatedTickets` / `showActivityRecap` (generative-UI cards via `render()`); and
  the human-in-the-loop tools (`useHumanInTheLoop`) `draftReply`, `createTicket`,
  `changeCustomerPlan`, and `proposeTicketActions` (one approval card batching N ticket
  changes; per-row approve applies immediately, resolves once). They are surfaced to the
  model by `copilotkitMiddleware` and routed back to the browser to execute.
- **A2UI tool** (`render_a2ui`) is a *third* path, sitting alongside the fixed cards: a
  tool the **server-side A2UI middleware injects** (not declared in `actions.tsx`) so Aria
  composes a UI surface at runtime from a component catalog rather than picking a
  pre-built card. See the A2UI note under "Things that will bite you".

Two cross-cutting agentic features layer on top: a **proactive SLA watcher**
(`TicketsProvider` computes at-risk tickets; `SlaWatchBanner` injects a triage turn via
`useAgent().addMessage` + `runAgent` — detection is autonomous, the turn is client-triggered
because the graph can't self-schedule), and an **activity log** (`/api/activity`, written
client-side from the write handlers) that backs the "what did you do?" recap.

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
- **A2UI is already bundled in the pinned CopilotKit 1.57.x — no version bump.** It's
  enabled with `a2ui: { injectA2UITool: true }` on the `CopilotRuntime` (`copilot.ts`)
  plus a bespoke catalog on the client (`apps/web/src/copilot/a2uiCatalog.tsx`, passed via
  `CopilotKitProvider a2ui={{ catalog }}` in `App.tsx`). The catalog is **client-only** —
  `includeSchema` (default true) forwards its component schema to Aria as context (the same
  channel `useAgentContext` uses, so `mergeSystemMessages` folds it), which is why the
  server needs no schema and the **agent graph needs no code change**. The server-side A2UI
  middleware (`@ag-ui/a2ui-middleware`, nested under `@copilotkit/runtime`) injects the
  `render_a2ui` tool, progressively renders the surface as `a2ui-surface` activity events
  (a *separate* message type from the `render()` cards — additive), and on a surface button
  click feeds the action back into the **next run** via `forwardedProps.a2uiAction` as a
  synthetic `log_a2ui_event` tool result. The prompt (`apps/agent/src/prompt.ts`) scopes
  Aria to use it only for the "suggest next actions" panel and maps each action name back to
  a real tool (`setTicketPriority` / `assignTicket` / `draftReply`). Build the catalog from
  the same Zod `definitions` you give `createCatalog`; keep custom renderers on the app's CSS
  classes so a composed surface looks native. A2UI is **live-only** (needs the model), so the
  mocked offline suite doesn't cover the round-trip — `a2uiCatalog.test.ts` only asserts the
  catalog builds.
- **The agent graph id / web agentId is `support_agent`** (wired in
  `apps/agent/langgraph.json`, `AGENT_GRAPH_ID` env, and `App.tsx`). Keep them in sync.
- **DeepWiki MCP degrades gracefully** (`apps/agent/src/tools/mcp.ts`): unreachable
  ⇒ returns `[]` after a 10s timeout so the agent still works on local tickets.
- **Dev wiring is pinned to IPv4 (`127.0.0.1`), not `localhost` — keep it that way.**
  The services bind IPv4 (Fastify `0.0.0.0`; the agent via `langgraphjs dev --host
  127.0.0.1` in `apps/agent/package.json`), and every inter-process URL uses
  `127.0.0.1` (the Vite proxy target in `apps/web/vite.config.ts`, plus `AGENT_URL` /
  `SERVER_API_URL` / `RUNBOOKS_MCP_URL` and their `env.ts` defaults). Using
  `localhost` instead reintroduces a dual-stack hazard: on hosts where `localhost`
  resolves `::1` (IPv6) first, requests hit the IPv6 path and only survive if Node
  falls back to IPv4 — Node 22 does, **Node 24 does not**, giving
  `AggregateError [ECONNREFUSED]` on every `/api/*`. Note your gitignored `.env`
  overrides these defaults, so a stale `.env` with `localhost` URLs re-breaks it on
  a fresh machine — re-copy from `.env.example`.
- **`npm run dev` runs through `scripts/dev.sh`, not `concurrently` directly.** The
  wrapper SIGKILLs stale port listeners before starting and traps `EXIT/INT/TERM` to
  free them again on teardown (via `scripts/free-ports.sh`), because Ctrl-C doesn't
  reliably reach the grandchild `tsx watch` / `langgraphjs dev` processes — without
  this they orphan and squat on `:4100/:2024/:4000/:5173` (now also `:4200/:4300`).
- **A2A subagents: the shared context is a bearer token, not LLM context.** The web app
  forwards the signed-in session as `CopilotKitProvider properties={{ config: { configurable:
  { session } } }}` — the **exact** nesting matters (CopilotKit spreads `properties` into
  `forwardedProps`, and `@ag-ui/langgraph` merges `forwardedProps.config` into the run config).
  The delegation tool (`apps/agent/src/tools/a2a.ts`) reads `config.configurable.session` and
  sends the token as `Authorization: Bearer`; if you only see `readonly` behavior, that wiring
  (or the `config_schema` passthrough) is the first thing to check — there's a `console.warn`
  probe in the tool. Never route the token through `useAgentContext` (that's the LLM prompt).
- **A2A delegation is registry-based + dynamic, not one tool per subagent.** `apps/agent/src/tools/a2a.ts`
  keeps a `SubagentRegistry` that re-reads the manifest + re-resolves cards every `A2A_REFRESH_MS`
  (default 30s), and the agent exposes two GENERIC tools over it — `list_subagents` and
  `delegate_to_subagent(agent_id, request)` — plus a `subagentRosterMiddleware` that injects the live
  roster into the system message each turn (via `wrapModelCall`, just before `mergeSystemMessages`).
  This is what lets newly registered subagents be picked up without a restart; a fixed per-subagent
  tool can't, because the compiled `createAgent` tool node is frozen at build. Don't reintroduce
  per-agent `delegate_to_<id>` tools.
- **A2A dummy hostnames need `/etc/hosts`.** Subagents bind `127.0.0.1` but advertise
  `insights-agent.vela.internal` / `account-admin.vela.internal` in their Agent Cards (and the
  manifest). Without the `/etc/hosts` mapping the cards don't resolve, so the subagent just isn't in
  the registry/roster (graceful degradation); the periodic refresh adds it once reachable. Keep binds on `127.0.0.1`.
- **The Python subagent pins `a2a-sdk` to the 0.3.x line** (via `google-adk[a2a]`), matching
  the `@a2a-js/sdk` 0.3.x the main agent uses (protocol `0.3.0`). Do NOT let `a2a-sdk` resolve
  to `1.x` — ADK needs `a2a.server.apps`, which the 1.x rewrite removed. It also needs
  `sse-starlette`. ADK doesn't propagate A2A request metadata to tool context (adk-python#3098),
  so the bearer token is read by a **pure-ASGI** middleware → `contextvars` (`app/caller.py`)
  and authz is enforced in a `before_tool_callback` reading that contextvar.
- **Use Node 24 for everything.** `better-sqlite3` is built against the project's Node (>=24);
  running tests/scripts under an older Node (e.g. a shell defaulting to 22) fails with a
  `NODE_MODULE_VERSION` mismatch. `.nvmrc` pins 24.

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
