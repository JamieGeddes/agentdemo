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
  serverApiUrl: process.env.SERVER_API_URL ?? "http://localhost:4000",
  /** Public DeepWiki remote MCP server (streamable HTTP, no auth). */
  deepwikiUrl: process.env.DEEPWIKI_MCP_URL ?? "https://mcp.deepwiki.com/mcp",
  /** Local internal-runbooks MCP server (streamable HTTP) — see apps/runbooks-mcp. */
  runbooksUrl: process.env.RUNBOOKS_MCP_URL ?? "http://localhost:4100/mcp",
  isTest: process.env.NODE_ENV === "test",
};
