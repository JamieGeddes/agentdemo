import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the repo-root .env regardless of which workspace cwd we run from.
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "../../../.env") });

export const env = {
  serverPort: Number(process.env.SERVER_PORT ?? 4000),
  /** LangGraph dev server that hosts the support_agent graph. */
  agentUrl: process.env.AGENT_URL ?? "http://127.0.0.1:2024",
  agentGraphId: process.env.AGENT_GRAPH_ID ?? "support_agent",
  webPort: Number(process.env.WEB_PORT ?? 5173),
  /** Absolute path for the SQLite file (":memory:" under test). */
  dbFile: process.env.NODE_ENV === "test" ? ":memory:" : resolve(here, "../data/support.db"),
  /** Repo-root A2A subagent manifest — read to list Agent Card links for the UI. */
  a2aManifestPath: process.env.A2A_MANIFEST_PATH ?? resolve(here, "../../../a2a-agents.json"),
  isTest: process.env.NODE_ENV === "test",
};
