import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { createDb } from "./db.js";
import { TicketStore } from "./ticketStore.js";
import { ticketRoutes } from "./routes/tickets.js";
import { registerCopilotRuntime } from "./copilot.js";

export interface BuildOptions {
  /** Override the SQLite file (tests pass ":memory:"). */
  dbFile?: string;
  /** Skip mounting the CopilotKit runtime (tests don't need the agent proxy). */
  withCopilot?: boolean;
}

/** Build a configured (but not yet listening) Fastify instance. */
export async function buildServer(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: !env.isTest });
  const db = createDb(opts.dbFile ?? env.dbFile);
  const store = new TicketStore(db);

  await app.register(cors, { origin: true });
  await app.register(ticketRoutes, { store });

  app.get("/health", async () => ({ status: "ok" }));

  if (opts.withCopilot ?? !env.isTest) {
    registerCopilotRuntime(app);
  }

  app.addHook("onClose", async () => db.close());
  return app;
}

// Start the server when run directly (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = await buildServer();
  app
    .listen({ port: env.serverPort, host: "0.0.0.0" })
    .then(() => app.log.info(`server listening on http://localhost:${env.serverPort}`))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
