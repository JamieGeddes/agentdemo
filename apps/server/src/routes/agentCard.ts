import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

interface ManifestEntry {
  id: string;
  url: string;
}

/** A discoverable Agent Card link for the UI panel. */
interface CardLink {
  id: string;
  name: string;
  kind: "main" | "subagent";
  cardUrl: string;
  reachable: boolean;
}

function readManifest(path: string): ManifestEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ManifestEntry =>
        !!e && typeof (e as ManifestEntry).id === "string" && typeof (e as ManifestEntry).url === "string",
    );
  } catch {
    return [];
  }
}

/** Fetch a subagent's card to check reachability + read its name. null if unreachable. */
async function probeCard(cardUrl: string, timeoutMs = 2000): Promise<{ name?: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cardUrl, { signal: controller.signal });
    return res.ok ? ((await res.json()) as { name?: string }) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish Aria's own A2A Agent Card so the support agent is a discoverable
 * participant in the A2A ecosystem (it is the A2A *client* of the subagents; this
 * advertises what it does in return). Publish-only — Aria does not accept inbound
 * A2A calls in this demo. The `url` uses the dummy hostname an operator maps to
 * 127.0.0.1 in /etc/hosts, matching how the subagents are registered.
 */
export async function agentCardRoutes(app: FastifyInstance): Promise<void> {
  const card = {
    protocolVersion: "0.3.0",
    name: "Aria — Vela Support Copilot",
    description:
      "An embedded copilot for a B2B support desk. Triages and summarizes tickets, looks up product/runbook and OSS knowledge, and delegates specialized work (insights reporting, account administration) to remote A2A subagents.",
    version: "1.0.0",
    url: `http://vela-desk.vela.internal:${env.serverPort}/api/copilotkit`,
    capabilities: { streaming: true, pushNotifications: false },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: [
      { id: "triage", name: "Ticket triage", description: "Rank open tickets by SLA-breach risk and propose next actions.", tags: ["tickets", "sla"] },
      { id: "summarize", name: "Ticket & customer summaries", description: "Summarize a ticket thread or an account's health for a rep.", tags: ["tickets", "customers"] },
      { id: "knowledge", name: "Knowledge lookup", description: "Answer product/operational (runbooks) and OSS-library (DeepWiki) questions with citations.", tags: ["knowledge"] },
    ],
  };

  app.get("/.well-known/agent-card.json", async () => card);

  // Discoverable list of A2A Agent Cards (the main agent + each registered subagent),
  // with live reachability. Backs the "Agent Cards" panel in the web UI so the demo can
  // open each `/.well-known/agent-card.json`. Reachability is probed server-side because
  // the subagents don't send CORS headers (a browser fetch would be blocked; a link/navigation isn't).
  app.get("/api/agent-cards", async () => {
    const self: CardLink = {
      id: env.agentGraphId,
      name: card.name,
      kind: "main",
      cardUrl: `http://localhost:${env.serverPort}/.well-known/agent-card.json`,
      reachable: true,
    };
    const subagents = await Promise.all(
      readManifest(env.a2aManifestPath).map(async (e): Promise<CardLink> => {
        const cardUrl = `${e.url.replace(/\/$/, "")}/.well-known/agent-card.json`;
        const probed = await probeCard(cardUrl);
        return { id: e.id, name: probed?.name ?? e.id, kind: "subagent", cardUrl, reachable: probed !== null };
      }),
    );
    return [self, ...subagents];
  });
}
