import type { Agent, Customer, Ticket } from "./types.js";

/**
 * Deterministic seed data for the PoC. Timestamps are fixed (not `Date.now()`)
 * so tests and demos are reproducible. Several tickets reference real
 * open-source libraries so the DeepWiki MCP "knowledge lookup" demo is coherent
 * (the agent can look up e.g. fastify/fastify or langchain-ai/langchainjs).
 */

export const seedAgents: Agent[] = [
  { id: "a1", name: "Maya Chen", avatar: "MC" },
  { id: "a2", name: "Devraj Patel", avatar: "DP" },
  { id: "a3", name: "Sofia Rossi", avatar: "SR" },
];

export const seedCustomers: Customer[] = [
  { id: "c1", company: "Acme Robotics", contactName: "Priya Nair", email: "priya@acmerobotics.com", plan: "enterprise", slaTier: "1h" },
  { id: "c2", company: "Globex Corp", contactName: "Tom Becker", email: "tom@globex.io", plan: "pro", slaTier: "8h" },
  { id: "c3", company: "Initech", contactName: "Sara Lund", email: "sara@initech.com", plan: "pro", slaTier: "8h" },
  { id: "c4", company: "Umbrella Health", contactName: "Marcus Lee", email: "marcus@umbrella.health", plan: "enterprise", slaTier: "1h" },
  { id: "c5", company: "Hooli", contactName: "Dana Swift", email: "dana@hooli.com", plan: "free", slaTier: "24h" },
];

export const seedTickets: Ticket[] = [
  {
    id: "T-1001",
    subject: "CORS errors when calling our Fastify API from the browser",
    body: "Since upgrading our backend we get 'No 'Access-Control-Allow-Origin' header' errors on every fetch from our React app. What's the right way to enable CORS in Fastify?",
    status: "open",
    priority: "urgent",
    customerId: "c1",
    assigneeId: "a1",
    tags: ["api", "cors", "fastify"],
    createdAt: "2026-05-18T08:12:00.000Z",
    updatedAt: "2026-05-18T09:01:00.000Z",
    messages: [
      { id: "m1", author: "customer", authorName: "Priya Nair", body: "This is blocking our production rollout — every request from the browser fails with a CORS error.", createdAt: "2026-05-18T08:12:00.000Z" },
      { id: "m2", author: "agent", authorName: "Maya Chen", body: "Thanks Priya, taking a look now. Can you confirm which origin your frontend is served from?", createdAt: "2026-05-18T09:01:00.000Z" },
    ],
  },
  {
    id: "T-1002",
    subject: "Streaming responses cut off after ~30 seconds",
    body: "Our LangChain-powered assistant streams tokens fine for short answers, but long generations get truncated around the 30s mark behind our proxy. Any guidance?",
    status: "open",
    priority: "high",
    customerId: "c2",
    assigneeId: null,
    tags: ["streaming", "langchain", "timeout"],
    createdAt: "2026-05-17T14:40:00.000Z",
    updatedAt: "2026-05-17T14:40:00.000Z",
    messages: [
      { id: "m3", author: "customer", authorName: "Tom Becker", body: "Repro: ask for a 1,000-word summary, the stream stops mid-sentence at ~30s. Short prompts are fine.", createdAt: "2026-05-17T14:40:00.000Z" },
    ],
  },
  {
    id: "T-1003",
    subject: "How do I rotate API keys without downtime?",
    body: "We need to rotate the API keys for our integration but can't afford downtime. Is there a recommended dual-key rollover process?",
    status: "pending",
    priority: "normal",
    customerId: "c3",
    assigneeId: "a2",
    tags: ["security", "api-keys"],
    createdAt: "2026-05-16T11:05:00.000Z",
    updatedAt: "2026-05-17T10:22:00.000Z",
    messages: [
      { id: "m4", author: "customer", authorName: "Sara Lund", body: "Ideally we'd add a new key, migrate, then revoke the old one. Does your platform support overlapping keys?", createdAt: "2026-05-16T11:05:00.000Z" },
      { id: "m5", author: "agent", authorName: "Devraj Patel", body: "Yes — you can have up to 5 active keys. I'll send the rollover steps shortly.", createdAt: "2026-05-16T15:30:00.000Z" },
      { id: "m6", author: "customer", authorName: "Sara Lund", body: "Great, waiting on those steps before our maintenance window Friday.", createdAt: "2026-05-17T10:22:00.000Z" },
    ],
  },
  {
    id: "T-1004",
    subject: "Webhook deliveries failing with 401",
    body: "All webhook deliveries to our endpoint started returning 401 yesterday. Nothing changed on our side. Can you check the signing secret?",
    status: "open",
    priority: "high",
    customerId: "c4",
    assigneeId: "a3",
    tags: ["webhooks", "auth"],
    createdAt: "2026-05-18T06:30:00.000Z",
    updatedAt: "2026-05-18T07:15:00.000Z",
    messages: [
      { id: "m7", author: "customer", authorName: "Marcus Lee", body: "Started at 03:00 UTC. We verify the HMAC signature and it no longer matches.", createdAt: "2026-05-18T06:30:00.000Z" },
      { id: "m8", author: "agent", authorName: "Sofia Rossi", body: "Looking into whether a secret was rotated on our end. Will update within the hour per your SLA.", createdAt: "2026-05-18T07:15:00.000Z" },
    ],
  },
  {
    id: "T-1005",
    subject: "Feature request: bulk export tickets to CSV",
    body: "We'd love a way to export all our tickets to CSV for quarterly reporting. Is this on the roadmap?",
    status: "pending",
    priority: "low",
    customerId: "c5",
    assigneeId: "a1",
    tags: ["feature-request", "export"],
    createdAt: "2026-05-12T09:00:00.000Z",
    updatedAt: "2026-05-14T16:45:00.000Z",
    messages: [
      { id: "m9", author: "customer", authorName: "Dana Swift", body: "Even a basic CSV with subject/status/priority/dates would be hugely helpful.", createdAt: "2026-05-12T09:00:00.000Z" },
      { id: "m10", author: "agent", authorName: "Maya Chen", body: "Logged as a feature request and shared with product. I'll keep this open for updates.", createdAt: "2026-05-14T16:45:00.000Z" },
    ],
  },
  {
    id: "T-1006",
    subject: "React app re-renders the whole list on every keystroke",
    body: "Our ticket search box re-renders the entire list and feels laggy. We're on React 18. Any best-practice guidance to debounce/memoize?",
    status: "resolved",
    priority: "normal",
    customerId: "c2",
    assigneeId: "a2",
    tags: ["react", "performance", "frontend"],
    createdAt: "2026-05-10T13:20:00.000Z",
    updatedAt: "2026-05-11T08:05:00.000Z",
    messages: [
      { id: "m11", author: "customer", authorName: "Tom Becker", body: "Typing in the filter box drops frames once we pass ~500 rows.", createdAt: "2026-05-10T13:20:00.000Z" },
      { id: "m12", author: "agent", authorName: "Devraj Patel", body: "Recommended memoizing the row component and debouncing the search input. Sharing a snippet.", createdAt: "2026-05-10T17:10:00.000Z" },
      { id: "m13", author: "customer", authorName: "Tom Becker", body: "That fixed it — smooth now even at 2k rows. Thanks!", createdAt: "2026-05-11T08:05:00.000Z" },
    ],
  },
  {
    id: "T-1007",
    subject: "Billing invoice shows incorrect seat count",
    body: "Our May invoice charged for 25 seats but we only have 18 active users. Please review.",
    status: "open",
    priority: "normal",
    customerId: "c3",
    assigneeId: null,
    tags: ["billing"],
    createdAt: "2026-05-15T10:00:00.000Z",
    updatedAt: "2026-05-15T10:00:00.000Z",
    messages: [
      { id: "m14", author: "customer", authorName: "Sara Lund", body: "Can you confirm the seat count used for the May billing cycle? We deactivated 7 users in April.", createdAt: "2026-05-15T10:00:00.000Z" },
    ],
  },
  {
    id: "T-1008",
    subject: "Connecting an MCP server to our agent",
    body: "We're trying to connect a remote MCP server over streamable HTTP to our LangGraph agent but the tools never show up. What's the correct client setup?",
    status: "closed",
    priority: "low",
    customerId: "c1",
    assigneeId: "a3",
    tags: ["mcp", "langgraph", "integration"],
    createdAt: "2026-05-08T12:00:00.000Z",
    updatedAt: "2026-05-09T09:30:00.000Z",
    messages: [
      { id: "m15", author: "customer", authorName: "Priya Nair", body: "We point at the /mcp endpoint but bindTools sees no tools.", createdAt: "2026-05-08T12:00:00.000Z" },
      { id: "m16", author: "agent", authorName: "Sofia Rossi", body: "You need to load tools from the MCP client and pass them to bindTools — sent docs links.", createdAt: "2026-05-08T15:20:00.000Z" },
      { id: "m17", author: "customer", authorName: "Priya Nair", body: "Worked perfectly. Closing this out, thanks!", createdAt: "2026-05-09T09:30:00.000Z" },
    ],
  },
];
