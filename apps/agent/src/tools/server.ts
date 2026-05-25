import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type Activity,
  type Agent,
  type Customer,
  type Ticket,
} from "@agentdemo/shared";
import { env } from "../env.js";

/** Compact projection so we don't flood the model's context with every field. */
function summarizeTicket(t: Ticket) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    customerId: t.customerId,
    assigneeId: t.assigneeId,
    tags: t.tags,
    updatedAt: t.updatedAt,
  };
}

/**
 * Read-only tools the agent runs server-side against the Fastify REST API.
 * Writes are intentionally done through *frontend actions* instead, so the
 * rep sees them happen in the UI.
 */
export function createServerTools(apiUrl: string = env.serverApiUrl): StructuredToolInterface[] {
  const listTickets = tool(
    async ({ status, priority, search, sort, customerId }) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (search) params.set("search", search);
      if (sort) params.set("sort", sort);
      if (customerId) params.set("customerId", customerId);
      const res = await fetch(`${apiUrl}/api/tickets?${params.toString()}`);
      if (!res.ok) throw new Error(`list_tickets failed: ${res.status}`);
      const tickets = (await res.json()) as Ticket[];
      return JSON.stringify(tickets.map(summarizeTicket));
    },
    {
      name: "list_tickets",
      description: "List support tickets, optionally filtered by status, priority, customer, or a text search. Returns a compact summary of each.",
      schema: z.object({
        status: z.enum(TICKET_STATUSES).optional().describe("Filter by ticket status"),
        priority: z.enum(TICKET_PRIORITIES).optional().describe("Filter by priority"),
        search: z.string().optional().describe("Free-text search across subject and body"),
        sort: z.enum(["newest", "oldest", "priority"]).optional(),
        customerId: z.string().optional().describe("Filter by customer id, e.g. c1"),
      }),
    },
  );

  const listCustomers = tool(
    async () => {
      const res = await fetch(`${apiUrl}/api/customers`);
      if (!res.ok) throw new Error(`list_customers failed: ${res.status}`);
      const customers = (await res.json()) as Customer[];
      return JSON.stringify(
        customers.map((c) => ({
          id: c.id,
          company: c.company,
          plan: c.plan,
          slaTier: c.slaTier,
          contactName: c.contactName,
        })),
      );
    },
    {
      name: "list_customers",
      description: "List the B2B customers in the system, with their plan and SLA tier.",
      schema: z.object({}),
    },
  );

  const getTicket = tool(
    async ({ id }) => {
      const res = await fetch(`${apiUrl}/api/tickets/${encodeURIComponent(id)}`);
      if (res.status === 404) return `No ticket found with id ${id}.`;
      if (!res.ok) throw new Error(`get_ticket failed: ${res.status}`);
      const ticket = (await res.json()) as Ticket;
      return JSON.stringify(ticket);
    },
    {
      name: "get_ticket",
      description: "Get a single ticket by id, including its full conversation thread.",
      schema: z.object({ id: z.string().describe("The ticket id, e.g. T-1001") }),
    },
  );

  const listAgents = tool(
    async () => {
      const res = await fetch(`${apiUrl}/api/agents`);
      if (!res.ok) throw new Error(`list_agents failed: ${res.status}`);
      const agents = (await res.json()) as Agent[];
      return JSON.stringify(agents.map((a) => ({ id: a.id, name: a.name })));
    },
    {
      name: "list_agents",
      description:
        "List the support reps (the team roster), with their id and name. Use this to map a rep's name (e.g. \"Sofia\") to an assigneeId before proposing an assignment.",
      schema: z.object({}),
    },
  );

  const listActivity = tool(
    async ({ sessionId }) => {
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      const res = await fetch(`${apiUrl}/api/activity?${params.toString()}`);
      if (!res.ok) throw new Error(`list_activity failed: ${res.status}`);
      const activity = (await res.json()) as Activity[];
      return JSON.stringify(
        activity.map((a) => ({ kind: a.kind, ticketId: a.ticketId, summary: a.summary, at: a.createdAt })),
      );
    },
    {
      name: "list_activity",
      description:
        "List what has been done in this session (the audit log of agent-driven changes: status/priority/assignment/reply/plan/ticket changes). Use this to answer \"what did you do?\" / recap the session.",
      schema: z.object({
        sessionId: z.string().optional().describe("Scope the recap to one browser session id"),
      }),
    },
  );

  return [listTickets, getTicket, listCustomers, listAgents, listActivity];
}
