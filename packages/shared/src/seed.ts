import type { Agent, Customer, Message, Ticket, User } from "./types.js";

/**
 * Deterministic seed data for the PoC. Ticket/message timestamps are expressed
 * as **relative offsets** ("minutes ago") and resolved against a `now` anchor at
 * seed time (see `buildSeedTickets`), NOT as fixed calendar dates. This keeps the
 * intended SLA mix (see the offsets below) stable whenever the demo is seeded or
 * reset — frozen dates would make every open ticket breach once wall-clock time
 * drifts past them. Tests stay deterministic by passing an explicit `now`.
 *
 * Several tickets reference real open-source libraries so the DeepWiki MCP
 * "knowledge lookup" demo is coherent (the agent can look up e.g. fastify/fastify
 * or langchain-ai/langchainjs).
 */

export const seedAgents: Agent[] = [
  { id: "a1", name: "Maya Chen", avatar: "MC" },
  { id: "a2", name: "Devraj Patel", avatar: "DP" },
  { id: "a3", name: "Sofia Rossi", avatar: "SR" },
];

export const seedCustomers: Customer[] = [
  { id: "c1", company: "Acme Robotics", contactName: "Priya Nair", email: "priya@acmerobotics.com", plan: "enterprise", slaTier: "1h", seats: 40 },
  { id: "c2", company: "Globex Corp", contactName: "Tom Becker", email: "tom@globex.io", plan: "pro", slaTier: "8h", seats: 25 },
  { id: "c3", company: "Initech", contactName: "Sara Lund", email: "sara@initech.com", plan: "pro", slaTier: "8h", seats: 25 },
  { id: "c4", company: "Umbrella Health", contactName: "Marcus Lee", email: "marcus@umbrella.health", plan: "enterprise", slaTier: "1h", seats: 60 },
  { id: "c5", company: "Hooli", contactName: "Dana Swift", email: "dana@hooli.com", plan: "free", slaTier: "24h", seats: 5 },
];

/** A demo user including the (plaintext, demo-only) password used at login. */
export interface SeedUser extends User {
  password: string;
}

/**
 * Shared demo password for every account. App-themed and memorable, and (unlike a
 * password equal to the username) not a weak/breached string the browser warns about.
 * Demo only — never hardcode a real credential.
 */
export const DEMO_PASSWORD = "veladesk";

/**
 * Three hardcoded demo users, one per access level — all share `DEMO_PASSWORD`.
 * The `role` is what the subagents check once it travels with the request inside
 * the shared bearer token.
 */
export const seedUsers: SeedUser[] = [
  { id: "u1", name: "Alice Admin", username: "admin", password: DEMO_PASSWORD, role: "admin" },
  { id: "u2", name: "Morgan Manager", username: "manager", password: DEMO_PASSWORD, role: "manager" },
  { id: "u3", name: "Robert Read", username: "readonly", password: DEMO_PASSWORD, role: "readonly" },
];

/** Find a user by exact username + password. Returns undefined on no match. */
export function findUserByLogin(username: string, password: string): SeedUser | undefined {
  return seedUsers.find((u) => u.username === username && u.password === password);
}

/** A seed message with its timestamp expressed as minutes before the seed anchor. */
type MessageSpec = Omit<Message, "createdAt"> & { createdMinAgo: number };

/**
 * A seed ticket whose timestamps are relative offsets. `updatedMinAgo` tracks the
 * last activity (typically the most recent message), matching how the live store
 * bumps `updatedAt`.
 */
type TicketSpec = Omit<Ticket, "createdAt" | "updatedAt" | "messages"> & {
  createdMinAgo: number;
  updatedMinAgo: number;
  messages: MessageSpec[];
};

/**
 * Offsets are tuned to give a deliberate, stable SLA distribution among the six
 * active (open/pending) tickets — 2 breaching, 2 warning, the rest ok:
 *   T-1004 1h  @110m → breach   T-1001 1h  @100m → breach
 *   T-1002 8h  @390m → warning  T-1003 8h  @380m → warning
 *   T-1007 8h  @180m → ok       T-1005 24h @480m → ok
 * Elapsed only grows, so a warning ticket can escalate to breach but never fall
 * back to ok; the offsets leave ~1.5h of headroom before the warning pair tips.
 * Settled tickets (resolved/closed) don't affect SLA — their offsets are days-old
 * for realism only.
 */
const ticketSpecs: TicketSpec[] = [
  {
    id: "T-1001",
    subject: "CORS errors when calling our Fastify API from the browser",
    body: "Since upgrading our backend we get 'No 'Access-Control-Allow-Origin' header' errors on every fetch from our React app. What's the right way to enable CORS in Fastify?",
    status: "open",
    priority: "urgent",
    customerId: "c1",
    assigneeId: "a1",
    tags: ["api", "cors", "fastify"],
    createdMinAgo: 100,
    updatedMinAgo: 85,
    messages: [
      { id: "m1", author: "customer", authorName: "Priya Nair", body: "This is blocking our production rollout — every request from the browser fails with a CORS error.", createdMinAgo: 100 },
      { id: "m2", author: "agent", authorName: "Maya Chen", body: "Thanks Priya, taking a look now. Can you confirm which origin your frontend is served from?", createdMinAgo: 85 },
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
    createdMinAgo: 390,
    updatedMinAgo: 390,
    messages: [
      { id: "m3", author: "customer", authorName: "Tom Becker", body: "Repro: ask for a 1,000-word summary, the stream stops mid-sentence at ~30s. Short prompts are fine.", createdMinAgo: 390 },
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
    createdMinAgo: 380,
    updatedMinAgo: 250,
    messages: [
      { id: "m4", author: "customer", authorName: "Sara Lund", body: "Ideally we'd add a new key, migrate, then revoke the old one. Does your platform support overlapping keys?", createdMinAgo: 380 },
      { id: "m5", author: "agent", authorName: "Devraj Patel", body: "Yes — you can have up to 5 active keys. I'll send the rollover steps shortly.", createdMinAgo: 320 },
      { id: "m6", author: "customer", authorName: "Sara Lund", body: "Great, waiting on those steps before our maintenance window Friday.", createdMinAgo: 250 },
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
    createdMinAgo: 110,
    updatedMinAgo: 95,
    messages: [
      { id: "m7", author: "customer", authorName: "Marcus Lee", body: "Started at 03:00 UTC. We verify the HMAC signature and it no longer matches.", createdMinAgo: 110 },
      { id: "m8", author: "agent", authorName: "Sofia Rossi", body: "Looking into whether a secret was rotated on our end. Will update within the hour per your SLA.", createdMinAgo: 95 },
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
    createdMinAgo: 480,
    updatedMinAgo: 300,
    messages: [
      { id: "m9", author: "customer", authorName: "Dana Swift", body: "Even a basic CSV with subject/status/priority/dates would be hugely helpful.", createdMinAgo: 480 },
      { id: "m10", author: "agent", authorName: "Maya Chen", body: "Logged as a feature request and shared with product. I'll keep this open for updates.", createdMinAgo: 300 },
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
    createdMinAgo: 2880,
    updatedMinAgo: 1440,
    messages: [
      { id: "m11", author: "customer", authorName: "Tom Becker", body: "Typing in the filter box drops frames once we pass ~500 rows.", createdMinAgo: 2880 },
      { id: "m12", author: "agent", authorName: "Devraj Patel", body: "Recommended memoizing the row component and debouncing the search input. Sharing a snippet.", createdMinAgo: 2820 },
      { id: "m13", author: "customer", authorName: "Tom Becker", body: "That fixed it — smooth now even at 2k rows. Thanks!", createdMinAgo: 1440 },
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
    createdMinAgo: 180,
    updatedMinAgo: 180,
    messages: [
      { id: "m14", author: "customer", authorName: "Sara Lund", body: "Can you confirm the seat count used for the May billing cycle? We deactivated 7 users in April.", createdMinAgo: 180 },
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
    createdMinAgo: 5760,
    updatedMinAgo: 4320,
    messages: [
      { id: "m15", author: "customer", authorName: "Priya Nair", body: "We point at the /mcp endpoint but bindTools sees no tools.", createdMinAgo: 5760 },
      { id: "m16", author: "agent", authorName: "Sofia Rossi", body: "You need to load tools from the MCP client and pass them to bindTools — sent docs links.", createdMinAgo: 5700 },
      { id: "m17", author: "customer", authorName: "Priya Nair", body: "Worked perfectly. Closing this out, thanks!", createdMinAgo: 4320 },
    ],
  },
];

/** Resolve a "minutes ago" offset to an ISO 8601 string against the seed anchor. */
const isoAgo = (now: number, minAgo: number): string =>
  new Date(now - minAgo * 60_000).toISOString();

/**
 * Build the seed tickets with concrete timestamps anchored to `now` (the moment
 * of seeding). Called by the DB seeder/reset so first boot, `npm run reset`, and
 * the Reset-demo button all produce the same SLA distribution relative to the
 * current time. Pass an explicit `now` for deterministic tests.
 */
export function buildSeedTickets(now: number = Date.now()): Ticket[] {
  return ticketSpecs.map(({ createdMinAgo, updatedMinAgo, messages, ...rest }) => ({
    ...rest,
    createdAt: isoAgo(now, createdMinAgo),
    updatedAt: isoAgo(now, updatedMinAgo),
    messages: messages.map(({ createdMinAgo: msgMinAgo, ...msg }) => ({
      ...msg,
      createdAt: isoAgo(now, msgMinAgo),
    })),
  }));
}

/**
 * Convenience snapshot built at module load. Fine for structure-only consumers
 * (ids, counts, references); the DB seeder calls {@link buildSeedTickets} directly
 * so its timestamps track the actual seed moment.
 */
export const seedTickets: Ticket[] = buildSeedTickets();
