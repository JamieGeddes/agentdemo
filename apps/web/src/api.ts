import type {
  Activity,
  ActivityCreateInput,
  Agent,
  AuthSession,
  Customer,
  CustomerPatch,
  Ticket,
  TicketCreateInput,
  TicketListQuery,
  TicketPatch,
} from "@agentdemo/shared";

/** Thin REST client for the Fastify ticketing API (proxied through Vite). */

function qs(query: TicketListQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// The logged-in user's bearer token. Set by AuthProvider on login/hydrate and
// attached to every request so the server can attribute actions to the user.
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Merge the auth header (if signed in) with any extra headers. */
function headers(extra?: Record<string, string>): Record<string, string> {
  return { ...(extra ?? {}), ...(authToken ? { authorization: `Bearer ${authToken}` } : {}) };
}

const jsonHeaders = () => headers({ "content-type": "application/json" });

/** An A2A Agent Card link surfaced in the UI (main agent + each registered subagent). */
export interface AgentCardLink {
  id: string;
  name: string;
  kind: "main" | "subagent";
  cardUrl: string;
  reachable: boolean;
}

export const api = {
  login: (username: string, password: string) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username, password }),
    }).then(json<AuthSession>),

  listTickets: (query: TicketListQuery = {}) =>
    fetch(`/api/tickets${qs(query)}`, { headers: headers() }).then(json<Ticket[]>),

  getTicket: (id: string) => fetch(`/api/tickets/${id}`, { headers: headers() }).then(json<Ticket>),

  createTicket: (input: TicketCreateInput) =>
    fetch("/api/tickets", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(input),
    }).then(json<Ticket>),

  patchTicket: (id: string, patch: TicketPatch) =>
    fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(patch),
    }).then(json<Ticket>),

  addMessage: (id: string, body: string, authorName = "You") =>
    fetch(`/api/tickets/${id}/messages`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ author: "agent", authorName, body }),
    }).then(json<Ticket>),

  listCustomers: () => fetch("/api/customers", { headers: headers() }).then(json<Customer[]>),
  listAgents: () => fetch("/api/agents", { headers: headers() }).then(json<Agent[]>),

  patchCustomer: (id: string, patch: CustomerPatch) =>
    fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(patch),
    }).then(json<Customer>),

  logActivity: (input: ActivityCreateInput) =>
    fetch("/api/activity", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(input),
    }).then(json<Activity>),

  reset: () => fetch("/api/reset", { method: "POST", headers: headers() }).then(json<{ ok: boolean }>),

  listAgentCards: () => fetch("/api/agent-cards", { headers: headers() }).then(json<AgentCardLink[]>),
};
