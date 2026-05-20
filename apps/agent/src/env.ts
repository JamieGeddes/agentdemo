import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "../../../.env") });

export const env = {
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  /** Base URL of the Fastify ticketing REST API (server tools call this). */
  serverApiUrl: process.env.SERVER_API_URL ?? "http://localhost:4000",
  /** Public DeepWiki remote MCP server (streamable HTTP, no auth). */
  deepwikiUrl: process.env.DEEPWIKI_MCP_URL ?? "https://mcp.deepwiki.com/mcp",
  isTest: process.env.NODE_ENV === "test",
};
