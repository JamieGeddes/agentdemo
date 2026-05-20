import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
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
    async ({ status, priority, search, sort }) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (search) params.set("search", search);
      if (sort) params.set("sort", sort);
      const res = await fetch(`${apiUrl}/api/tickets?${params.toString()}`);
      if (!res.ok) throw new Error(`list_tickets failed: ${res.status}`);
      const tickets = (await res.json()) as Ticket[];
      return JSON.stringify(tickets.map(summarizeTicket));
    },
    {
      name: "list_tickets",
      description: "List support tickets, optionally filtered by status, priority, or a text search. Returns a compact summary of each.",
      schema: z.object({
        status: z.enum(TICKET_STATUSES).optional().describe("Filter by ticket status"),
        priority: z.enum(TICKET_PRIORITIES).optional().describe("Filter by priority"),
        search: z.string().optional().describe("Free-text search across subject and body"),
        sort: z.enum(["newest", "oldest", "priority"]).optional(),
      }),
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

  return [listTickets, getTicket];
}
