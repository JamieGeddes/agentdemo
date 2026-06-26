import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";

interface CardLink {
  id: string;
  name: string;
  kind: "main" | "subagent";
  cardUrl: string;
  reachable: boolean;
}

describe("GET /api/agent-cards", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ dbFile: ":memory:", withCopilot: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists the main agent (reachable) + each manifest subagent, probing reachability", async () => {
    // Stub the server-side reachability probe so subagents report reachable.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ name: "Stub Card" }), { status: 200, headers: { "content-type": "application/json" } })),
    );

    const res = await app.inject({ method: "GET", url: "/api/agent-cards" });
    expect(res.statusCode).toBe(200);
    const cards = res.json() as CardLink[];

    const main = cards.find((c) => c.kind === "main");
    expect(main?.reachable).toBe(true);
    expect(main?.cardUrl).toContain("/.well-known/agent-card.json");

    const subs = cards.filter((c) => c.kind === "subagent");
    expect(subs.length).toBeGreaterThanOrEqual(2); // insights + account_admin from a2a-agents.json
    expect(subs.every((c) => c.reachable)).toBe(true);
    expect(subs.every((c) => c.cardUrl.endsWith("/.well-known/agent-card.json"))).toBe(true);
  });

  it("marks a subagent unreachable when its card can't be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const res = await app.inject({ method: "GET", url: "/api/agent-cards" });
    const subs = (res.json() as CardLink[]).filter((c) => c.kind === "subagent");
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((c) => c.reachable === false)).toBe(true);
  });
});
