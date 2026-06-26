import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  isCustomerPlan,
  isTicketPriority,
  isTicketStatus,
  type CustomerPatch,
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
      customerId: q.customerId || undefined,
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

  // Reset the demo back to the seeded defaults (undo a session's changes).
  app.post("/api/reset", async (_req, reply) => {
    store.reset();
    return reply.code(200).send({ ok: true });
  });

  app.get("/api/activity", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = q.limit ? Math.min(Number(q.limit) || 50, 200) : 50;
    return store.listActivity(q.sessionId || undefined, limit);
  });

  app.post("/api/activity", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!body.kind || typeof body.kind !== "string") {
      return reply.code(400).send({ error: "kind is required" });
    }
    if (!body.summary || typeof body.summary !== "string") {
      return reply.code(400).send({ error: "summary is required" });
    }
    const created = store.logActivity({
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      kind: body.kind,
      ticketId: typeof body.ticketId === "string" ? body.ticketId : null,
      summary: body.summary,
      detail: typeof body.detail === "string" ? body.detail : null,
    });
    return reply.code(201).send(created);
  });

  app.patch("/api/customers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as CustomerPatch;

    if (body.plan !== undefined && !isCustomerPlan(body.plan)) {
      return reply.code(400).send({ error: "invalid plan" });
    }
    if (body.seats !== undefined && (!Number.isInteger(body.seats) || body.seats < 0)) {
      return reply.code(400).send({ error: "seats must be a non-negative integer" });
    }

    const updated = store.updateCustomer(id, body);
    if (!updated) return reply.code(404).send({ error: "customer not found" });
    return updated;
  });

  // Privileged account actions invoked by the account-admin subagent (after it has
  // authorized the caller). They persist their effect — plan/seats mutate the
  // customer row above; credit and key-rotation are recorded as activity (the demo
  // has no billing/secret store, so the activity log IS the record). The subagent
  // logs the activity itself via POST /api/activity, mirroring the web client.
  app.post("/api/customers/:id/service-credit", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { amountCents?: unknown };
    const amountCents = body.amountCents;
    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
      return reply.code(400).send({ error: "amountCents must be a positive integer" });
    }
    const customer = store.getCustomer(id);
    if (!customer) return reply.code(404).send({ error: "customer not found" });
    return reply.code(201).send({
      ok: true,
      customer,
      amountCents,
      creditId: `cr_${randomUUID().slice(0, 12)}`,
      issuedAt: new Date().toISOString(),
    });
  });

  app.post("/api/customers/:id/rotate-api-key", async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = store.getCustomer(id);
    if (!customer) return reply.code(404).send({ error: "customer not found" });
    return reply.code(201).send({
      ok: true,
      customer,
      keyId: `sk_live_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      rotatedAt: new Date().toISOString(),
    });
  });
}
