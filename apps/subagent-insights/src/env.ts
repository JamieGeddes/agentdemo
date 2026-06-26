import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the repo-root .env regardless of which workspace cwd we run from.
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "../../../.env") });

export const env = {
  /** Bind address — IPv4, matching the rest of the dev wiring (no `localhost`). */
  host: process.env.INSIGHTS_HOST ?? "127.0.0.1",
  port: Number(process.env.INSIGHTS_PORT ?? 4200),
  /**
   * Public base URL advertised in the Agent Card. Uses the dummy hostname an
   * operator maps to 127.0.0.1 in /etc/hosts, simulating a remote agent.
   */
  publicUrl: process.env.INSIGHTS_PUBLIC_URL ?? "http://insights-agent.vela.internal:4200",
  /** Fastify REST API the insights tools read from. */
  serverApiUrl: process.env.SERVER_API_URL ?? "http://127.0.0.1:4000",
  // Gemini backend — shared with the main agent.
  llmBackend: process.env.LLM_BACKEND ?? "gemini-api",
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  vertexProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  vertexLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "europe-west1",
  isTest: process.env.NODE_ENV === "test",
};
