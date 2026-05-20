import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { env } from "../env.js";

let cached: { client: MultiServerMCPClient; tools: StructuredToolInterface[] } | null = null;

/**
 * Connect to the external DeepWiki remote MCP server (streamable HTTP, no auth)
 * and load its tools (ask_question, read_wiki_structure, read_wiki_contents).
 *
 * Degrades gracefully: if the server is unreachable we return [] so the agent
 * still works on local tickets. Tools are cached across runs.
 */
export async function loadDeepwikiTools(): Promise<StructuredToolInterface[]> {
  if (cached) return cached.tools;
  try {
    const client = new MultiServerMCPClient({
      throwOnLoadError: false,
      useStandardContentBlocks: true,
      mcpServers: {
        deepwiki: { url: env.deepwikiUrl, transport: "http" },
      },
    });
    // Don't let an unreachable MCP server stall agent/dev-server startup.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DeepWiki MCP connection timed out")), 10_000),
    );
    const tools = await Promise.race([client.getTools(), timeout]);
    cached = { client, tools };
    return tools;
  } catch (err) {
    console.warn(`[mcp] could not load DeepWiki tools, continuing without them:`, err);
    return [];
  }
}

/** Names of the loaded MCP tools — used to tag research findings as external knowledge. */
export async function deepwikiToolNames(): Promise<Set<string>> {
  const tools = await loadDeepwikiTools();
  return new Set(tools.map((t) => t.name));
}
