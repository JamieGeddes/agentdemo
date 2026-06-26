import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "../../../.env") });

export const env = {
  /**
   * Which Gemini backend to use: "gemini-api" (Google AI Studio key) or "vertex"
   * (Vertex AI via Application Default Credentials). Same model ids work on both.
   */
  llmBackend: process.env.LLM_BACKEND ?? "gemini-api",
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  /** Vertex AI only: GCP project id (defaults to the ADC project if unset). */
  vertexProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  /** Vertex AI only: region for the model endpoint. */
  vertexLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "europe-west1",
  /** Base URL of the Fastify ticketing REST API (server tools call this). */
  serverApiUrl: process.env.SERVER_API_URL ?? "http://127.0.0.1:4000",
  /** Public DeepWiki remote MCP server (streamable HTTP, no auth). */
  deepwikiUrl: process.env.DEEPWIKI_MCP_URL ?? "https://mcp.deepwiki.com/mcp",
  /** Local internal-runbooks MCP server (streamable HTTP) — see apps/runbooks-mcp. */
  runbooksUrl: process.env.RUNBOOKS_MCP_URL ?? "http://127.0.0.1:4100/mcp",
  /** Manifest of A2A subagents the agent delegates to (repo-root a2a-agents.json). */
  a2aManifestPath: process.env.A2A_MANIFEST_PATH ?? resolve(here, "../../../a2a-agents.json"),
  /** Per-subagent connection/agent-card timeout (ms) — graceful degradation if exceeded. */
  a2aTimeoutMs: Number(process.env.A2A_TIMEOUT_MS ?? 10_000),
  /** How often (ms) to re-read the manifest + re-resolve subagent cards, so newly
   *  registered subagents are picked up without restarting the agent. */
  a2aRefreshMs: Number(process.env.A2A_REFRESH_MS ?? 30_000),
  isTest: process.env.NODE_ENV === "test",
};
