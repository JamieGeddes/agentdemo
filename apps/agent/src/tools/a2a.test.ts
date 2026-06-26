import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentCard } from "@a2a-js/sdk";
import { SubagentRegistry, __test, buildSubagentTools } from "./a2a.js";

function cardFor(baseUrl: string, name: string): AgentCard {
  return {
    protocolVersion: "0.3.0",
    name,
    description: `${name} does useful things.`,
    version: "1.0.0",
    url: `${baseUrl}/a2a/jsonrpc`,
    preferredTransport: "JSONRPC",
    additionalInterfaces: [{ url: `${baseUrl}/a2a/jsonrpc`, transport: "JSONRPC" }],
    capabilities: {},
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: [{ id: "s", name: "Skill", description: "does things", tags: [] }],
  };
}

/** Stub global fetch: serve a card for any well-known GET; answer jsonrpc POSTs. */
function stubFetch(
  opts: { onAuth?: (auth: string | null) => void; cardName?: (base: string) => string; failOn?: (url: string) => boolean } = {},
) {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
    if (url.endsWith("/.well-known/agent-card.json")) {
      if (opts.failOn?.(url)) return new Response("nope", { status: 503 });
      const base = url.replace("/.well-known/agent-card.json", "");
      return new Response(JSON.stringify(cardFor(base, opts.cardName?.(base) ?? base)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    opts.onAuth?.(new Headers(init?.headers).get("authorization"));
    const reqId = (JSON.parse(String(init?.body ?? "{}")) as { id?: unknown }).id ?? 1;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: reqId,
        result: { kind: "message", messageId: "m", role: "agent", parts: [{ kind: "text", text: `ok:${url}` }] },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function tmpManifest(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "a2a-"));
  const p = join(dir, "a2a-agents.json");
  writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  return p;
}

afterEach(() => vi.unstubAllGlobals());

describe("readManifest", () => {
  it("parses valid entries and skips malformed ones", () => {
    const p = tmpManifest([{ id: "insights", url: "http://x" }, { id: 1 }, { url: "y" }, null]);
    expect(__test.readManifest(p)).toEqual([{ id: "insights", url: "http://x" }]);
    rmSync(join(p, ".."), { recursive: true, force: true });
  });

  it("returns [] for a missing file or a non-array document", () => {
    expect(__test.readManifest("/no/such/manifest.json")).toEqual([]);
    const p = tmpManifest({ not: "an array" });
    expect(__test.readManifest(p)).toEqual([]);
    rmSync(join(p, ".."), { recursive: true, force: true });
  });
});

describe("SubagentRegistry refresh + dynamic pickup", () => {
  it("resolves cards from the manifest and exposes them via list/get/roster", async () => {
    vi.stubGlobal("fetch", stubFetch({ cardName: () => "Insights Agent" }));
    const p = tmpManifest([{ id: "insights", url: "http://insights.test" }]);
    const reg = new SubagentRegistry();
    await reg.refresh(p, 500);
    expect(reg.list().map((s) => s.id)).toEqual(["insights"]);
    expect(reg.get("insights")?.card.name).toBe("Insights Agent");
    expect(reg.roster()).toContain("- insights:");
    rmSync(join(p, ".."), { recursive: true, force: true });
  });

  it("picks up a NEWLY registered subagent on the next refresh — no restart", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const p = tmpManifest([{ id: "insights", url: "http://insights.test" }]);
    const reg = new SubagentRegistry();
    await reg.refresh(p, 500);
    expect(reg.list().map((s) => s.id)).toEqual(["insights"]);

    // A new subagent is registered (manifest gains an entry) while the agent runs…
    writeFileSync(
      p,
      JSON.stringify([
        { id: "insights", url: "http://insights.test" },
        { id: "billing", url: "http://billing.test" },
      ]),
    );
    await reg.refresh(p, 500);
    expect(reg.list().map((s) => s.id).sort()).toEqual(["billing", "insights"]);
    rmSync(join(p, ".."), { recursive: true, force: true });
  });

  it("drops a subagent whose card can't be resolved (graceful degradation)", async () => {
    vi.stubGlobal("fetch", stubFetch({ failOn: (u) => u.includes("down.test") }));
    const p = tmpManifest([{ id: "down", url: "http://down.test" }]);
    const reg = new SubagentRegistry();
    await reg.refresh(p, 300);
    expect(reg.list()).toEqual([]);
    expect(reg.roster()).toBe("");
    rmSync(join(p, ".."), { recursive: true, force: true });
  });
});

describe("delegate_to_subagent tool", () => {
  it("forwards the session token as a bearer credential and returns the subagent text", async () => {
    let seenAuth: string | null = "MISSING";
    vi.stubGlobal("fetch", stubFetch({ onAuth: (a) => (seenAuth = a) }));
    const p = tmpManifest([{ id: "insights", url: "http://insights.test" }]);
    const reg = new SubagentRegistry();
    await reg.refresh(p, 500);

    const [, delegate] = buildSubagentTools(reg); // [list, delegate]
    const out = await delegate.invoke(
      { agent_id: "insights", request: "do it" },
      { configurable: { session: { token: "tok-admin" }, thread_id: "ctx-1" } },
    );
    expect(out).toContain("ok:");
    expect(seenAuth).toBe("Bearer tok-admin");
    rmSync(join(p, ".."), { recursive: true, force: true });
  });

  it("returns a helpful message (not an error) for an unknown agent_id", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const p = tmpManifest([{ id: "insights", url: "http://insights.test" }]);
    const reg = new SubagentRegistry();
    await reg.refresh(p, 500);
    const [, delegate] = buildSubagentTools(reg);
    const out = await delegate.invoke({ agent_id: "nope", request: "x" });
    expect(out).toContain('No subagent "nope"');
    expect(out).toContain("insights");
    rmSync(join(p, ".."), { recursive: true, force: true });
  });
});

describe("list_subagents tool", () => {
  it("lists the live registry (id + capabilities)", async () => {
    vi.stubGlobal("fetch", stubFetch({ cardName: () => "Insights Agent" }));
    const p = tmpManifest([{ id: "insights", url: "http://insights.test" }]);
    const reg = new SubagentRegistry();
    await reg.refresh(p, 500);
    const [list] = buildSubagentTools(reg);
    expect(JSON.parse(await list.invoke({}))).toEqual([
      { id: "insights", capabilities: "Insights Agent does useful things." },
    ]);
    rmSync(join(p, ".."), { recursive: true, force: true });
  });
});

describe("resultText", () => {
  it("reads text from a Message result", () => {
    const msg = { kind: "message", messageId: "m", role: "agent", parts: [{ kind: "text", text: "hi" }] };
    expect(__test.resultText(msg as never)).toBe("hi");
  });

  it("reads text from a Task's status message and artifacts", () => {
    const task = {
      id: "t",
      contextId: "c",
      status: { state: "completed", message: { kind: "message", messageId: "s", role: "agent", parts: [{ kind: "text", text: "status-note" }] } },
      artifacts: [{ artifactId: "a", parts: [{ kind: "text", text: "the answer" }] }],
    };
    const out = __test.resultText(task as never);
    expect(out).toContain("the answer");
    expect(out).toContain("status-note");
  });
});
