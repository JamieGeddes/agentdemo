# Vela — Agentic Support Desk (PoC)

A proof of concept showing how an **agentic layer** can be grafted onto an
existing B2B support/ticketing app *as seamlessly as possible*. The agent
("Aria") lives in a sidebar inside the real product and can drive the UI, render
rich answers in chat, pause for human approval, and pull in external knowledge —
without replacing the app it lives in.

## Stack

| Concern | Tech |
| --- | --- |
| Front end | React + Vite, **CopilotKit** chat sidebar (**AG-UI** + **A2UI**) |
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
9. **A2UI generative UI (agent-composed)** — alongside the fixed cards above, Aria can
   compose a *bespoke interactive panel at runtime* from an A2UI component catalog
   (`render_a2ui`); clicking a button on that panel routes the action back to Aria, which
   runs the real tool. The contrast in one chat: fixed-card generative UI (AG-UI) vs. UI
   whose *structure the agent designs* (A2UI).
10. **A2A subagents with a shared context + authorization** — Aria delegates specialist
    work to two **remote subagents over the [A2A protocol](https://github.com/a2aproject/A2A)**,
    each advertising its capabilities through an **Agent Card**: an **Insights** agent
    (TypeScript + LangGraph) for SLA/queue/customer reporting, and an **Account-Admin** agent
    (**Python + Google ADK**) for privileged account actions (seats, service credit, API-key
    rotation). The signed-in user's identity + role travels as the A2A **bearer credential**
    (the "shared context"), and the subagents enforce **role-based authorization** — e.g. only
    an **admin** may rotate an API key; a **manager** gets a non-applied preview; **readonly**
    is denied, and the Insights report returns less detail. Subagents are discovered from a
    `a2a-agents.json` manifest and registered under dummy hostnames (`*.vela.internal`) to
    simulate remote agents.

## Prerequisites

- Node ≥ 24 (see `.nvmrc`)
- A **Gemini API key** — required only to run the agent's LLM loop.
  Get one at <https://aistudio.google.com/apikey>.
- **Python ≥ 3.10** — only for the account-admin subagent (Google ADK). Everything else
  runs without Python; if you skip it, that one subagent is simply offline (Aria degrades
  gracefully).

## Setup

```bash
npm install
cp .env.example .env        # then edit .env and set GOOGLE_API_KEY=...
npm run setup:admin         # one-time: create the Python venv for the account-admin subagent
```

Key settings in `.env`: `GOOGLE_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`),
and the ports/URLs (`SERVER_PORT=4000`, `AGENT_PORT=2024`, `WEB_PORT=5173`).

**A2A subagents — map the dummy hostnames.** The two subagents bind `127.0.0.1` but advertise
"remote" hostnames in their Agent Cards, so the main agent fetches their cards over those names.
Add them to `/etc/hosts` (one-time). On macOS/Linux use the `sudo tee -a` form — a plain
`sudo echo … >> /etc/hosts` fails because the `>>` redirect runs as your user, not root:

```bash
printf '\n# Vela A2A demo subagents (dummy hostnames → localhost)\n127.0.0.1 insights-agent.vela.internal account-admin.vela.internal vela-desk.vela.internal\n' | sudo tee -a /etc/hosts

grep vela.internal /etc/hosts        # verify it landed
```

Run the append **once** (re-running adds duplicate lines — the `grep` lets you check first).
`insights-agent.vela.internal` and `account-admin.vela.internal` are the load-bearing names;
`vela-desk.vela.internal` only appears in Aria's own published card. macOS reads `/etc/hosts`
immediately (no restart). To undo later, delete those lines (`sudo nano /etc/hosts`). Without the
mapping the subagents just don't appear in the agent's registry/roster and Aria still runs without
them (and they're picked up automatically once reachable — see the periodic refresh below).

## Run

Use Node 24 and provide the Gemini key, then start everything. Run it in **one terminal**
(`Ctrl-C` stops all six services and frees their ports):

```bash
nvm use                                       # Node 24 (reads .nvmrc) — required
export GOOGLE_API_KEY="your-gemini-api-key"   # or set it in .env instead (see Setup)
npm run dev      # starts all six: runbooks-mcp (:4100), agent (:2024), server (:4000),
                 # web (:5173), insights subagent (:4200), account-admin subagent (:4300)
```

Then open <http://localhost:5173> and **sign in**. Three demo users (all share the password
`veladesk`) have different access levels the subagents enforce:

| Username   | Display name   | Role     | Can do via subagents                                         |
|------------|----------------|----------|--------------------------------------------------------------|
| `admin`    | Alice Admin    | admin    | everything — incl. seats / service credit / API-key rotation |
| `manager`  | Morgan Manager | manager  | full reports; admin actions return a non-applied **preview** |
| `readonly` | Robert Read    | readonly | summary-only reports; admin actions are **denied**           |

The SQLite database is created and seeded automatically on first run. An `export` lasts for the
current shell only — re-export in a new terminal, or set `GOOGLE_API_KEY` in `.env` to persist it.

> Processes can also be started individually: `npm run dev:agent`, `npm run dev:server`,
> `npm run dev:web`, `npm run dev:insights`, `npm run dev:admin`.
>
> To demo **dynamic subagent registration**, split the stack across two terminals instead of
> `npm run dev`: `npm run dev:core` runs the app *without* subagents (runbooks, agent, server,
> web), then `npm run dev:subagents` brings up the two subagents later — see below.

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

This script shows the four generative-UI capabilities added on top of the basics
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

### 4. A2UI: an agent-composed interactive panel

The cards above are fixed React components Aria fills with data. A2UI is different:
Aria designs the panel's **structure** at runtime from a small component catalog
(`apps/web/src/copilot/a2uiCatalog.tsx`), and its buttons act back on the desk.

- *"Open T-1001 and suggest next actions."* → instead of a fixed card, Aria composes an
  **interactive panel** in the chat (a summary line, an SLA badge / priority pill, and a
  couple of action buttons). Watch the **"Designing a custom panel"** step in the progress
  panel.
- **Click an action** (e.g. *Escalate to urgent* / *Assign* / *Draft reply*) → the click
  routes back to Aria, which runs the **real** tool — the ticket updates live in the inbox
  and persists, exactly like the other write paths.
- Contrast it directly: *"Summarize T-1001"* still renders the fixed AG-UI summary card —
  same chat, two different generative-UI approaches.

### Kitchen-sink finale (all three in one turn)

- *"Open T-1002, read it, look up how LangChain handles streaming and timeouts,
  summarize the root cause as a card, and draft a reply to Tom."* — streams the
  progress panel, renders a citation + summary card, and ends in a reply approval.

## Demo script: A2A subagents + authorization

The point of this script is **the same request, three different sign-ins** — only the logged-in
user changes, and the subagents enforce what each role may do. Switch users with the
**⎋ sign-out** button on the nav rail (it reloads to the login screen); reset state afterwards
with the **⟳** Reset-demo button.

**Insights agent — role-tiers the detail.** Ask any of these; the report comes back richer the
higher your role (`readonly` = summary only, no contacts/export; `manager`/`admin` = full ranked
report + customer contacts + CSV). Aria delegates to the Insights subagent over A2A and relays it:

- *"Give me an SLA risk report."*
- *"How is the team's workload spread right now?"*
- *"How healthy is the Acme Robotics account?"*

**Account-Admin agent — allow / preview / deny by role.** Ask the same privileged request as each
user and watch the outcome change: **admin** applies it, **manager** gets a non-applied preview,
**readonly** is denied (Aria relays the subagent's reason):

- *"Rotate Acme Robotics' API key."*
- *"Set Globex Corp's seats to 30."*
- *"Issue a $200 service credit to Hooli."*

Applied changes persist: seat/plan changes show on the **Customers** page, and every admin action
(including credit and key-rotation) lands in the activity feed — ask *"what did you do this
session?"* to see Aria recap them.

### Dynamic registration (start with no subagents, add them live)

The main agent keeps a background-refreshed registry, so subagents can be registered *while it's
running*. Demo it with two terminals:

```bash
# Terminal 1 — the app WITHOUT subagents (registry starts empty)
npm run dev:core

# Terminal 2 — bring the subagents up LATER
npm run dev:subagents
```

1. With only `dev:core` running, sign in and ask *"what specialists can you delegate to?"* or
   *"give me an SLA risk report"* → Aria reports there are **no subagents available** (its
   `list_subagents` is empty).
2. Now start `npm run dev:subagents`. Within a few seconds (`dev:core` sets `A2A_REFRESH_MS=8000`
   for a snappy demo) the running agent's next refresh resolves their Agent Cards.
3. Ask the **same** question again — Aria now lists the Insights and Account-Admin specialists and
   delegates to them. **No restart of the main agent.** Stopping `dev:subagents` (Ctrl-C) removes
   them again on the next refresh; `dev:core` keeps running throughout (the two halves free only
   their own ports on teardown).

The **🪪 Agent cards** panel (bottom-left of the app) makes this visual: expand it to see the main
agent plus each registered subagent, with a live reachability dot (green when up) and a link that
opens that agent's `/.well-known/agent-card.json`. Start `dev:subagents` and watch the dots flip
green within a few seconds — and click a link to show what an A2A Agent Card actually looks like.

## Test

```bash
npm test         # Vitest across shared / server / agent / web / subagent-insights
                 # (no API key needed — the model is mocked, so tests are offline + deterministic)
npm run typecheck

# The Python account-admin subagent has its own pytest suite (authz + token decode),
# run separately because it uses a different runner. Requires `npm run setup:admin` first:
npm run test --workspace apps/subagent-admin
```

The **live A2A round-trips** (Aria → subagents) and the **ADK subagent end-to-end** are
live-only: they need the running services, the `/etc/hosts` entries, and a `GOOGLE_API_KEY`,
so they aren't part of the offline suite.

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
- **A2UI** rides the same `/api/copilotkit` bridge — no agent-graph changes. It's
  enabled with one flag on the runtime (`a2ui: { injectA2UITool: true }` in
  `copilot.ts`) plus a bespoke component catalog on the client
  (`apps/web/src/copilot/a2uiCatalog.tsx`, registered via `CopilotKitProvider
  a2ui={{ catalog }}`). The A2UI middleware injects a `render_a2ui` tool so Aria can
  compose a surface, streams it into chat, and feeds surface button clicks back into
  the next run for Aria to act on.
- **A2A subagents** (`apps/subagent-insights`, TS + LangGraph + `@a2a-js/sdk`;
  `apps/subagent-admin`, Python + Google ADK via `to_a2a()`). `apps/agent/src/tools/a2a.ts`
  keeps a **background-refreshed registry**: it re-reads the repo-root `a2a-agents.json` manifest
  and re-resolves every Agent Card on an interval (`A2A_REFRESH_MS`, default 30s), degrading
  gracefully per-subagent. The agent exposes two **generic** tools over that registry —
  `list_subagents` and `delegate_to_subagent(agent_id, request)` — and a middleware injects the
  live roster into the prompt each turn, so a **newly registered subagent is picked up without a
  restart** (a fixed per-subagent tool couldn't be, since a compiled graph's tool set is frozen).
  The **shared context** is the signed-in session: the web app forwards it as structured
  `CopilotKitProvider properties` → `forwardedProps.config.configurable.session` (never through the
  LLM), and the delegation tool presents its token as an `Authorization: Bearer` credential on the
  A2A call. Each subagent decodes that token to recover the caller's role and **authorizes
  deterministically** (the Insights tools tier their output; the ADK agent gates writes in a
  `before_tool_callback`). Privileged actions persist via the Fastify REST API and the activity feed.

## Notes & limitations

- **Single-route mode is required.** The server runs the v2 runtime with
  `mode: "single-route"` and the client sets `useSingleEndpoint`. In the default
  multi-route mode, a frontend-tool call's two-run pause/resume clears the chat
  transcript in the v2 client; single-route mode renders it correctly. Both must
  match.
- The agent's UI changes go through **frontend tools** (so the rep sees them in the
  UI) and persist via the REST API to SQLite.
- The DeepWiki MCP connection degrades gracefully: if it's unreachable the agent
  still works on local tickets. **The A2A subagents degrade the same way** — if a subagent
  (or its `/etc/hosts` entry) is missing it just isn't in the registry/roster, and the periodic
  refresh (`A2A_REFRESH_MS`, default 30s) picks it up automatically once it's reachable — no restart.
- **A2A is live-only.** The subagents run their own Gemini loops, so the round-trip isn't in
  the mocked offline suite. The shared-context credential is **simulated** (an unsigned,
  JWT-shaped token carrying `{ userId, userName, role }`) — fine for the demo, not real auth.
- The account-admin subagent reads the bearer token at the HTTP layer (pure-ASGI middleware →
  `contextvars`) because ADK doesn't propagate A2A request metadata into tool context
  ([adk-python#3098](https://github.com/google/adk-python/issues/3098)).
- This is a PoC: in-process dev servers, seeded demo data, and a single graph.
  Production would use a deployed LangGraph runtime, auth, and real persistence.
