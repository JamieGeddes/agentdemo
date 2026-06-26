import type { FastifyInstance } from "fastify";
import { findUserByLogin, mintToken, type AuthSession, type User } from "@agentdemo/shared";

/**
 * Minimal demo login. Validates a hardcoded username/password and returns the
 * user plus a simulated bearer token (see `mintToken`) the web app then carries
 * as the shared credential across the A2A agents. No sessions/cookies — the token
 * is the whole story.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (req, reply) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    if (typeof body.username !== "string" || typeof body.password !== "string") {
      return reply.code(400).send({ error: "username and password are required" });
    }

    const match = findUserByLogin(body.username, body.password);
    if (!match) return reply.code(401).send({ error: "invalid credentials" });

    const user: User = {
      id: match.id,
      name: match.name,
      username: match.username,
      role: match.role,
    };
    const session: AuthSession = { user, token: mintToken(user) };
    return reply.code(200).send(session);
  });
}
