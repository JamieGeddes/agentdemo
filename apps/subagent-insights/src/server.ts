import Fastify from "fastify";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import type { MessageSendParams } from "@a2a-js/sdk";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { decodeToken } from "@agentdemo/shared";
import { env } from "./env.js";
import { buildAgentCard } from "./agentCard.js";
import { createInsightsExecutor } from "./executor.js";
import { runWithCaller } from "./caller.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

/**
 * Stand up the Insights agent as an A2A server (JSON-RPC transport) on **Fastify**
 * — the same HTTP stack as the main API server (apps/server). The A2A SDK only
 * ships Express handlers, so instead of pulling in Express we drive its
 * framework-agnostic `DefaultRequestHandler` from a plain Fastify route:
 *  - GET  /.well-known/agent-card.json  → the Agent Card (capability advertisement)
 *  - POST /a2a/jsonrpc                   → A2A JSON-RPC (blocking `message/send`)
 *
 * Fastify's logger logs every request; we add one line per call recording the A2A
 * method and the caller's role. The bearer token (the shared context) is decoded
 * here and the handler runs inside `runWithCaller`, so the executor/tools can read
 * the caller while authorizing.
 */
export function buildApp() {
  const card = buildAgentCard();
  const requestHandler = new DefaultRequestHandler(card, new InMemoryTaskStore(), createInsightsExecutor());

  const app = Fastify({ logger: !env.isTest });

  app.get(`/${AGENT_CARD_PATH}`, async () => card);

  app.post("/a2a/jsonrpc", async (request) => {
    const body = (request.body ?? {}) as JsonRpcRequest;
    const id = body.id ?? null;
    const caller = decodeToken(request.headers.authorization);
    request.log.info({ a2aMethod: body.method, role: caller?.role ?? "anonymous" }, "a2a request");

    if (body.method !== "message/send") {
      // The demo only uses blocking message/send; advertise the rest as unsupported.
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${body.method}` } };
    }

    try {
      const result = await runWithCaller(caller, () =>
        requestHandler.sendMessage(body.params as MessageSendParams),
      );
      return { jsonrpc: "2.0", id, result };
    } catch (err) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: (err as Error).message } };
    }
  });

  return app;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = buildApp();
  app
    .listen({ port: env.port, host: env.host })
    .then(() =>
      app.log.info(`insights A2A agent on http://${env.host}:${env.port} (card: ${env.publicUrl}/${AGENT_CARD_PATH})`),
    )
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
