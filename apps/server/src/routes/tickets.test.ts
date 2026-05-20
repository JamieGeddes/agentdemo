import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";

describe("ticket routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ dbFile: ":memory:", withCopilot: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /api/tickets returns the seeded list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tickets" });
    expect(res.statusCode).toBe(200);
    const tickets = res.json();
    expect(Array.isArray(tickets)).toBe(true);
    expect(tickets.length).toBeGreaterThanOrEqual(8);
  });

  it("GET /api/tickets?status=open filters", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tickets?status=open" });
    expect(res.json().every((t: { status: string }) => t.status === "open")).toBe(true);
  });

  it("GET /api/tickets/:id returns one ticket, 404 otherwise", async () => {
    const ok = await app.inject({ method: "GET", url: "/api/tickets/T-1001" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().id).toBe("T-1001");

    const missing = await app.inject({ method: "GET", url: "/api/tickets/nope" });
    expect(missing.statusCode).toBe(404);
  });

  it("PATCH /api/tickets/:id updates and validates", async () => {
    const ok = await app.inject({
      method: "PATCH",
      url: "/api/tickets/T-1002",
      payload: { status: "pending", priority: "urgent" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe("pending");
    expect(ok.json().priority).toBe("urgent");

    const bad = await app.inject({
      method: "PATCH",
      url: "/api/tickets/T-1002",
      payload: { status: "banana" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("POST /api/tickets/:id/messages appends a message", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tickets/T-1001/messages",
      payload: { author: "agent", authorName: "Maya Chen", body: "On it." },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().messages.at(-1).body).toBe("On it.");

    const bad = await app.inject({
      method: "POST",
      url: "/api/tickets/T-1001/messages",
      payload: {},
    });
    expect(bad.statusCode).toBe(400);
  });

  it("POST /api/tickets creates a ticket and validates", async () => {
    const customers = await app.inject({ method: "GET", url: "/api/customers" });
    const customerId = customers.json()[0].id;

    const ok = await app.inject({
      method: "POST",
      url: "/api/tickets",
      payload: { subject: "Login failures", body: "Users cannot log in", customerId, priority: "high" },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().id).toMatch(/^T-\d+$/);
    expect(ok.json().priority).toBe("high");
    expect(ok.json().status).toBe("open");

    // it is now retrievable via the list/get endpoints
    const fetched = await app.inject({ method: "GET", url: `/api/tickets/${ok.json().id}` });
    expect(fetched.statusCode).toBe(200);

    const missingSubject = await app.inject({
      method: "POST",
      url: "/api/tickets",
      payload: { body: "no subject", customerId },
    });
    expect(missingSubject.statusCode).toBe(400);

    const badCustomer = await app.inject({
      method: "POST",
      url: "/api/tickets",
      payload: { subject: "x", body: "y", customerId: "nope" },
    });
    expect(badCustomer.statusCode).toBe(400);

    const badPriority = await app.inject({
      method: "POST",
      url: "/api/tickets",
      payload: { subject: "x", body: "y", customerId, priority: "banana" },
    });
    expect(badPriority.statusCode).toBe(400);
  });

  it("exposes customers and agents", async () => {
    const customers = await app.inject({ method: "GET", url: "/api/customers" });
    const agents = await app.inject({ method: "GET", url: "/api/agents" });
    expect(customers.json().length).toBeGreaterThan(0);
    expect(agents.json().length).toBeGreaterThan(0);
  });
});
