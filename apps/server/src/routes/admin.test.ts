import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";

describe("admin write endpoints (used by the account-admin subagent)", () => {
  let app: FastifyInstance;
  let customerId: string;

  beforeAll(async () => {
    app = await buildServer({ dbFile: ":memory:", withCopilot: false });
    await app.ready();
    customerId = (await app.inject({ method: "GET", url: "/api/customers" })).json()[0].id;
  });
  afterAll(async () => {
    await app.close();
  });

  it("seeds a seat count on customers", async () => {
    const c = (await app.inject({ method: "GET", url: "/api/customers" })).json()[0];
    expect(typeof c.seats).toBe("number");
    expect(c.seats).toBeGreaterThan(0);
  });

  it("PATCH /api/customers/:id sets seats and validates", async () => {
    const ok = await app.inject({ method: "PATCH", url: `/api/customers/${customerId}`, payload: { seats: 33 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().seats).toBe(33);

    const bad = await app.inject({ method: "PATCH", url: `/api/customers/${customerId}`, payload: { seats: -2 } });
    expect(bad.statusCode).toBe(400);
  });

  it("POST /api/customers/:id/service-credit returns a credit ref and validates", async () => {
    const ok = await app.inject({
      method: "POST",
      url: `/api/customers/${customerId}/service-credit`,
      payload: { amountCents: 20000 },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().amountCents).toBe(20000);
    expect(ok.json().creditId).toMatch(/^cr_/);

    const bad = await app.inject({
      method: "POST",
      url: `/api/customers/${customerId}/service-credit`,
      payload: { amountCents: 0 },
    });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: `/api/customers/nope/service-credit`,
      payload: { amountCents: 100 },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("POST /api/customers/:id/rotate-api-key returns a fresh key id, 404 on unknown", async () => {
    const ok = await app.inject({ method: "POST", url: `/api/customers/${customerId}/rotate-api-key` });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().keyId).toMatch(/^sk_live_/);

    const missing = await app.inject({ method: "POST", url: `/api/customers/nope/rotate-api-key` });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /.well-known/agent-card.json publishes Aria's card", async () => {
    const res = await app.inject({ method: "GET", url: "/.well-known/agent-card.json" });
    expect(res.statusCode).toBe(200);
    const card = res.json();
    expect(card.name).toContain("Aria");
    expect(Array.isArray(card.skills)).toBe(true);
    expect(card.skills.length).toBeGreaterThan(0);
  });
});
