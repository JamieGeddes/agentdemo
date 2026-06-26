import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { DEMO_PASSWORD, decodeToken } from "@agentdemo/shared";
import { buildServer } from "../server.js";

describe("auth routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ dbFile: ":memory:", withCopilot: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("POST /api/auth/login returns the user + a decodable token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: DEMO_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const session = res.json();
    expect(session.user.role).toBe("admin");
    expect(session.user).not.toHaveProperty("password");
    expect(decodeToken(session.token)).toMatchObject({ role: "admin", userName: session.user.name });
  });

  it("rejects a bad password with 401 and a missing field with 400", async () => {
    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "nope" },
    });
    expect(wrong.statusCode).toBe(401);

    const missing = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin" } });
    expect(missing.statusCode).toBe(400);
  });
});
