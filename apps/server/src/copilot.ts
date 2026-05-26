import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { env } from "./env.js";

const ENDPOINT = "/api/copilotkit";

/**
 * Mount the CopilotKit v2 (AG-UI) runtime onto the Fastify app.
 *
 * The LLM loop lives in the standalone LangGraph agent (started via
 * `langgraphjs dev`); the runtime bridges AG-UI traffic to it through a
 * `LangGraphAgent` pointed at the agent's deployment URL. v2 uses the AG-UI
 * protocol end-to-end (the React `@copilotkit/react-core/v2` client speaks it),
 * with multi-route endpoints: GET /info, POST /agent/:id/run, /threads, etc.
 *
 * `createCopilotRuntimeHandler` returns a fetch handler `(Request) => Response`.
 * Fastify has already JSON-parsed the body, so we hand it a reconstructed Web
 * `Request` and stream the `Response` back — preserving AG-UI's SSE streaming.
 */
export function registerCopilotRuntime(app: FastifyInstance): void {
  const runtime = new CopilotRuntime({
    agents: {
      [env.agentGraphId]: new LangGraphAgent({
        deploymentUrl: env.agentUrl,
        graphId: env.agentGraphId,
        // Aria's richer flows (SLA triage, multi-step runbook/DeepWiki lookups, the
        // batch proposeTicketActions card) exceed LangGraph's built-in default of 25
        // steps. The run config is assembled HERE and sent to the dev server on every
        // runs.stream() — .withConfig() on the compiled graph (apps/agent/src/graph.ts)
        // is bypassed by the dev-server path, so this is the load-bearing knob. (50 also
        // dodges @ag-ui/langgraph's mergeConfigs no-op check that rejects exactly 25.)
        assistantConfig: { recursion_limit: 50 },
      }),
    },
  });

  const handler = createCopilotRuntimeHandler({
    runtime,
    basePath: ENDPOINT,
    mode: "single-route",
    cors: true,
  });

  // Hop-by-hop / length headers we don't forward (we re-serialize the body).
  const STRIP = new Set(["content-length", "connection", "keep-alive", "transfer-encoding", "host", "accept-encoding"]);

  const proxy: import("fastify").RouteHandlerMethod = async (request, reply) => {
    const url = `http://localhost:${env.serverPort}${request.url}`;
    const method = request.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value == null || STRIP.has(key.toLowerCase())) continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const body = hasBody ? JSON.stringify(request.body ?? {}) : undefined;

    try {
      const webReq = new Request(url, {
        method,
        headers,
        body,
        ...(hasBody ? { duplex: "half" } : {}),
      } as RequestInit);

      const response = await handler(webReq);

      reply.hijack();
      reply.raw.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      // Flush headers immediately and disable buffering so AG-UI SSE chunks reach
      // the client as they arrive (critical for the frontend-tool pause/resume flow).
      reply.raw.flushHeaders();
      if (response.body) {
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(reply.raw);
      } else {
        reply.raw.end(await response.text());
      }
    } catch (err) {
      app.log.error({ err }, "CopilotKit runtime request failed");
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(502, { "content-type": "application/json" });
      }
      reply.raw.end(JSON.stringify({ error: "copilot runtime error", detail: (err as Error).message }));
    }
  };

  // The v2 client uses the endpoint AND multi-route sub-paths (/info, /threads,
  // /agent/:id/run). Register both so the handler can route them internally.
  app.all(ENDPOINT, proxy);
  app.all(`${ENDPOINT}/*`, proxy);

  app.log.info(`CopilotKit v2 runtime mounted at ${ENDPOINT} -> ${env.agentUrl} (${env.agentGraphId})`);
}
