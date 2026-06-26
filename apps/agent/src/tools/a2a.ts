import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import type { AgentCard, Message, Part, Task } from "@a2a-js/sdk";
import { env } from "../env.js";

/**
 * A2A client: a background-refreshed registry of remote subagents, surfaced to the
 * main agent as two generic tools (`list_subagents`, `delegate_to_subagent`).
 *
 * Subagents are discovered from the repo-root manifest and their Agent Cards are
 * re-resolved on an interval (see `SubagentRegistry`), so a NEWLY registered
 * subagent — a new manifest entry, or one that was offline at startup — is picked
 * up without restarting the agent. Because delegation goes through one generic
 * tool that reads the live registry (not one fixed tool per subagent baked into
 * the graph), new subagents become callable the moment the next refresh sees them.
 *
 * The shared context travels as the standard A2A bearer credential: the delegation
 * tool reads the logged-in session from `config.configurable.session` (forwarded by
 * the web app, never via the LLM) and sets `Authorization: Bearer <token>` on the
 * A2A request; the subagent decodes that to authorize by role.
 */

interface A2AEntry {
  id: string;
  url: string;
}

/** The session the web app forwards via CopilotKit `properties` → run config. */
interface ForwardedSession {
  user?: { id?: string; name?: string; role?: string };
  token?: string;
}

/** A subagent currently in the registry: its manifest id/url, resolved card, and a one-line summary. */
export interface RegisteredSubagent {
  id: string;
  url: string;
  card: AgentCard;
  summary: string;
}

function readManifest(path: string): A2AEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is A2AEntry =>
        !!e && typeof (e as A2AEntry).id === "string" && typeof (e as A2AEntry).url === "string",
    );
  } catch (err) {
    console.warn(`[a2a] no usable manifest at ${path}, continuing without subagents:`, err);
    return [];
  }
}

async function fetchCard(baseUrl: string, timeoutMs: number): Promise<AgentCard> {
  const url = `${baseUrl.replace(/\/$/, "")}/.well-known/agent-card.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return (await res.json()) as AgentCard;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveOne({ id, url }: A2AEntry, timeoutMs: number): Promise<RegisteredSubagent | null> {
  try {
    const card = await fetchCard(url, timeoutMs);
    return { id, url, card, summary: (card.description ?? "").split("\n")[0].trim() };
  } catch (err) {
    console.warn(`[a2a] could not resolve subagent "${id}" (${url}) this refresh, skipping:`, err);
    return null;
  }
}

function partsText(parts?: Part[]): string {
  return (parts ?? []).flatMap((p) => (p.kind === "text" ? [p.text] : [])).join("\n");
}

/** Pull human-readable text out of an A2A result (a Message, or a Task's artifacts/status). */
function resultText(result: Message | Task): string {
  if ((result as Message).kind === "message") return partsText((result as Message).parts);
  const task = result as Task;
  const fromArtifacts = (task.artifacts ?? []).map((a) => partsText(a.parts)).join("\n");
  const fromStatus = partsText(task.status?.message?.parts);
  return [fromStatus, fromArtifacts].filter(Boolean).join("\n").trim();
}

/** Send one A2A `message/send` to a subagent, forwarding the session as a bearer credential. */
async function sendToSubagent(card: AgentCard, request: string, config?: RunnableConfig): Promise<string> {
  const session = config?.configurable?.session as ForwardedSession | undefined;
  const token = session?.token;
  if (!token) {
    console.warn(
      `[a2a] delegate_to_subagent: no session token in config.configurable — the subagent will treat the caller as readonly. Check the web app's CopilotKit \`properties\` / forwardedProps wiring.`,
    );
  }
  // Group the delegated call into the same shared session as this conversation.
  const contextId =
    typeof config?.configurable?.thread_id === "string"
      ? (config.configurable.thread_id as string)
      : randomUUID();

  const fetchImpl: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  try {
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl })],
      }),
    );
    const client = await factory.createFromAgentCard(card);
    const result = await client.sendMessage({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "text", text: request }],
        contextId,
      },
    });
    return resultText(result) || `The ${card.name} subagent returned no text.`;
  } catch (err) {
    return `The ${card.name} subagent call failed: ${(err as Error).message}`;
  }
}

/**
 * A live, periodically-refreshed view of the registered subagents. Re-reads the
 * manifest and re-resolves every card each refresh, so additions/removals and
 * agents coming online are picked up at runtime. Each card resolves independently
 * and a failure just drops that subagent from this refresh (graceful degradation).
 */
export class SubagentRegistry {
  private subs: RegisteredSubagent[] = [];
  private timer?: ReturnType<typeof setInterval>;

  async refresh(
    manifestPath: string = env.a2aManifestPath,
    timeoutMs: number = env.a2aTimeoutMs,
  ): Promise<void> {
    const entries = readManifest(manifestPath);
    const resolved = await Promise.all(entries.map((e) => resolveOne(e, timeoutMs)));
    this.subs = resolved.filter((s): s is RegisteredSubagent => s !== null);
  }

  /** Begin refreshing on an interval. The timer is unref'd so it never holds the process open. */
  start(intervalMs: number = env.a2aRefreshMs): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.refresh().catch((err) => console.warn("[a2a] subagent refresh failed:", err));
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  list(): RegisteredSubagent[] {
    return this.subs;
  }

  get(id: string): RegisteredSubagent | undefined {
    return this.subs.find((s) => s.id === id);
  }

  /**
   * A compact roster of the currently-reachable subagents, injected into the system
   * prompt each turn so the model always sees the live line-up without a restart.
   * Returns "" when none are reachable.
   */
  roster(): string {
    if (!this.subs.length) return "";
    const lines = this.subs.map((s) => `- ${s.id}: ${s.summary}`).join("\n");
    return `\n\nSpecialist subagents reachable right now (delegate_to_subagent with the matching agent_id):\n${lines}`;
  }
}

/**
 * Build the registry, do an initial resolve, and start the background refresh.
 * Awaiting the first refresh means the first request already sees whatever is up;
 * anything that comes online later is picked up by the interval.
 */
export async function createSubagentRegistry(): Promise<SubagentRegistry> {
  const registry = new SubagentRegistry();
  await registry.refresh();
  registry.start(env.a2aRefreshMs);
  return registry;
}

/** The two generic delegation tools, backed by the live registry. */
export function buildSubagentTools(registry: SubagentRegistry): StructuredToolInterface[] {
  const list = tool(
    async () => JSON.stringify(registry.list().map((s) => ({ id: s.id, capabilities: s.summary }))),
    {
      name: "list_subagents",
      description:
        "List the specialist remote subagents available to delegate to right now (each id and what it does). The set can change at runtime, so re-check if unsure.",
      schema: z.object({}),
    },
  );

  const delegate = tool(
    async ({ agent_id, request }: { agent_id: string; request: string }, config?: RunnableConfig) => {
      const sub = registry.get(agent_id);
      if (!sub) {
        const ids = registry.list().map((s) => s.id).join(", ") || "(none reachable)";
        return `No subagent "${agent_id}" is currently registered. Available ids: ${ids}. Call list_subagents to see what each does.`;
      }
      return sendToSubagent(sub.card, request, config);
    },
    {
      name: "delegate_to_subagent",
      description:
        "Delegate a task to a specialist remote subagent over A2A. Pass its agent_id (from list_subagents or the roster) and a clear, self-contained natural-language request. The subagent runs its own permission checks against the signed-in user and may refuse.",
      schema: z.object({
        agent_id: z.string().describe("The id of the subagent to delegate to (from list_subagents / the roster)."),
        request: z
          .string()
          .describe("A clear, self-contained task for the subagent, naming the customer/ticket/values involved."),
      }),
    },
  );

  return [list, delegate];
}

// Exposed for unit tests.
export const __test = { readManifest, resultText };
