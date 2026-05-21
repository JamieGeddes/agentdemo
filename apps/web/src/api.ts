import type {
  Agent,
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

export const api = {
  listTickets: (query: TicketListQuery = {}) =>
    fetch(`/api/tickets${qs(query)}`).then(json<Ticket[]>),

  getTicket: (id: string) => fetch(`/api/tickets/${id}`).then(json<Ticket>),

  createTicket: (input: TicketCreateInput) =>
    fetch("/api/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then(json<Ticket>),

  patchTicket: (id: string, patch: TicketPatch) =>
    fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(json<Ticket>),

  addMessage: (id: string, body: string, authorName = "You") =>
    fetch(`/api/tickets/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author: "agent", authorName, body }),
    }).then(json<Ticket>),

  listCustomers: () => fetch("/api/customers").then(json<Customer[]>),
  listAgents: () => fetch("/api/agents").then(json<Agent[]>),

  patchCustomer: (id: string, patch: CustomerPatch) =>
    fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(json<Customer>),
};
