import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { env } from "../env.js";

interface McpSource {
  /** Stable key used for the client's server map + log messages. */
  name: string;
  url: string;
}

const cache = new Map<string, StructuredToolInterface[]>();

/**
 * Load one MCP server's tools over streamable HTTP, with a hard timeout so an
 * unreachable server can never stall agent/dev-server startup. Each server gets
 * its OWN client so a down server (e.g. the local runbooks one) can't take out
 * a reachable one (e.g. DeepWiki) — they degrade independently to [].
 */
async function loadOne({ name, url }: McpSource): Promise<StructuredToolInterface[]> {
  const cached = cache.get(name);
  if (cached) return cached;
  try {
    const client = new MultiServerMCPClient({
      throwOnLoadError: false,
      useStandardContentBlocks: true,
      mcpServers: { [name]: { url, transport: "http" } },
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${name} MCP connection timed out`)), 10_000),
    );
    const tools = await Promise.race([client.getTools(), timeout]);
    cache.set(name, tools);
    return tools;
  } catch (err) {
    console.warn(`[mcp] could not load ${name} tools, continuing without them:`, err);
    return [];
  }
}

/**
 * Load every MCP server the agent uses:
 *   - DeepWiki (remote, OSS-repo knowledge)
 *   - Runbooks (local, internal product/operational knowledge)
 * Both degrade gracefully and independently.
 */
export async function loadMcpTools(): Promise<StructuredToolInterface[]> {
  const [deepwiki, runbooks] = await Promise.all([
    loadOne({ name: "deepwiki", url: env.deepwikiUrl }),
    loadOne({ name: "runbooks", url: env.runbooksUrl }),
  ]);
  return [...deepwiki, ...runbooks];
}

/** Names of the loaded MCP tools — used to tag research findings as external knowledge. */
export async function mcpToolNames(): Promise<Set<string>> {
  const tools = await loadMcpTools();
  return new Set(tools.map((t) => t.name));
}
