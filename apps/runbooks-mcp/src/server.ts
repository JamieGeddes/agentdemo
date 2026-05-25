import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { readRunbook, RUNBOOKS, searchRunbooks } from "./runbooks.js";

const PORT = Number(process.env.RUNBOOKS_MCP_PORT ?? 4100);

/**
 * Internal-runbooks MCP server (streamable HTTP, stateless). Exposes two tools:
 *   - search_runbooks(query, category?)  → matching runbook stubs
 *   - read_runbook(id)                   → the full runbook body
 *
 * Stateless: a fresh McpServer + transport are built per request (the documented
 * pattern for `sessionIdGenerator: undefined`), so there is no session state to
 * leak between clients. Mirrors how the agent already talks to DeepWiki over HTTP.
 */
function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "runbooks", version: "1.0.0" });

  server.registerTool(
    "search_runbooks",
    {
      description:
        "Search the INTERNAL support runbooks (our platform's operational/product knowledge: webhooks, billing/seats, API-key rotation, auth). Returns matching runbook stubs with their id and title. Use read_runbook to fetch the full procedure.",
      inputSchema: {
        query: z.string().describe("What you're looking for, e.g. 'webhook 401 hmac' or 'seat count'"),
        category: z
          .enum(["webhooks", "billing", "security", "auth"])
          .optional()
          .describe("Optionally narrow to a category"),
      },
    },
    async ({ query, category }) => {
      const hits = searchRunbooks(query, category);
      return {
        content: [
          {
            type: "text",
            text: hits.length
              ? JSON.stringify(hits)
              : `No internal runbooks matched "${query}". Available: ${RUNBOOKS.map((r) => r.id).join(", ")}.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "read_runbook",
    {
      description: "Read the full body of an internal runbook by its id (e.g. rb-webhook-hmac).",
      inputSchema: { id: z.string().describe("The runbook id, e.g. rb-webhook-hmac") },
    },
    async ({ id }) => {
      const rb = readRunbook(id);
      return {
        content: [
          { type: "text", text: rb ? `# ${rb.title}\n\n${rb.body}` : `No runbook found with id ${id}.` },
        ],
      };
    },
  );

  return server;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "";

  if (req.method === "POST" && url.startsWith("/mcp")) {
    try {
      const body = await readBody(req);
      const server = buildMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error("[runbooks-mcp] request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }),
        );
      }
    }
    return;
  }

  // Stateless: no GET/SSE stream and no session to DELETE.
  if (url.startsWith("/mcp")) {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }),
    );
    return;
  }

  res.writeHead(404).end();
});

httpServer.listen(PORT, () => {
  console.log(`[runbooks-mcp] internal runbooks MCP server listening on http://localhost:${PORT}/mcp`);
});
