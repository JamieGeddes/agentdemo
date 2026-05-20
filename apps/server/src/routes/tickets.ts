import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  isTicketPriority,
  isTicketStatus,
  type TicketCreateInput,
  type TicketListQuery,
  type TicketPatch,
} from "@agentdemo/shared";
import type { TicketStore } from "../ticketStore.js";

interface RouteOpts extends FastifyPluginOptions {
  store: TicketStore;
}

/** REST API for the ticketing app: the same endpoints the UI and the agent's tools call. */
export async function ticketRoutes(app: FastifyInstance, opts: RouteOpts): Promise<void> {
  const { store } = opts;

  app.get("/api/tickets", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const query: TicketListQuery = {
      status: isTicketStatus(q.status) ? q.status : undefined,
      priority: isTicketPriority(q.priority) ? q.priority : undefined,
      assigneeId: q.assigneeId || undefined,
      search: q.search || undefined,
      sort: (["newest", "oldest", "priority"] as const).includes(q.sort as never)
        ? (q.sort as TicketListQuery["sort"])
        : undefined,
    };
    return store.list(query);
  });

  app.get("/api/tickets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ticket = store.get(id);
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });
    return ticket;
  });

  app.post("/api/tickets", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<TicketCreateInput>;

    if (!body.subject || typeof body.subject !== "string") {
      return reply.code(400).send({ error: "subject is required" });
    }
    if (!body.body || typeof body.body !== "string") {
      return reply.code(400).send({ error: "body is required" });
    }
    if (!body.customerId || !store.listCustomers().some((c) => c.id === body.customerId)) {
      return reply.code(400).send({ error: "invalid customerId" });
    }
    if (body.assigneeId != null && !store.listAgents().some((a) => a.id === body.assigneeId)) {
      return reply.code(400).send({ error: "invalid assigneeId" });
    }
    if (body.status !== undefined && !isTicketStatus(body.status)) {
      return reply.code(400).send({ error: "invalid status" });
    }
    if (body.priority !== undefined && !isTicketPriority(body.priority)) {
      return reply.code(400).send({ error: "invalid priority" });
    }

    const created = store.create({
      subject: body.subject,
      body: body.body,
      customerId: body.customerId,
      status: body.status,
      priority: body.priority,
      assigneeId: body.assigneeId ?? null,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
    });
    return reply.code(201).send(created);
  });

  app.patch("/api/tickets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as TicketPatch;

    if (body.status !== undefined && !isTicketStatus(body.status)) {
      return reply.code(400).send({ error: "invalid status" });
    }
    if (body.priority !== undefined && !isTicketPriority(body.priority)) {
      return reply.code(400).send({ error: "invalid priority" });
    }

    const updated = store.update(id, body);
    if (!updated) return reply.code(404).send({ error: "ticket not found" });
    return updated;
  });

  app.post("/api/tickets/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { author?: string; authorName?: string; body?: string };

    if (!body.body || typeof body.body !== "string") {
      return reply.code(400).send({ error: "message body is required" });
    }
    const author = body.author === "customer" ? "customer" : "agent";

    const updated = store.addMessage(id, {
      author,
      authorName: body.authorName ?? (author === "agent" ? "Support" : "Customer"),
      body: body.body,
    });
    if (!updated) return reply.code(404).send({ error: "ticket not found" });
    return updated;
  });

  app.get("/api/customers", async () => store.listCustomers());
  app.get("/api/agents", async () => store.listAgents());
}
