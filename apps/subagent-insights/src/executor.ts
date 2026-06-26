import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import type { Message } from "@a2a-js/sdk";
import type { AgentExecutor, ExecutionEventBus, RequestContext } from "@a2a-js/sdk/server";
import { buildInsightsAgent } from "./agent.js";

type InsightsAgent = ReturnType<typeof buildInsightsAgent>;

/** Join the text parts of an incoming A2A message. */
function userText(message: Message): string {
  return message.parts
    .flatMap((p) => (p.kind === "text" ? [p.text] : []))
    .join("\n")
    .trim();
}

/** Pull the final assistant text out of a LangGraph agent result. */
function agentText(result: { messages?: Array<{ content?: unknown }> }): string {
  const content = result.messages?.at(-1)?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
      .join("");
  }
  return "";
}

/**
 * Bridges A2A to the LangGraph agent: read the incoming message, run the agent
 * (the role-gated tools read the caller from AsyncLocalStorage), and publish the
 * answer as a single A2A message. The caller context is established by the
 * Fastify route (it wraps this in `runWithCaller`), so `execute` already runs inside it.
 */
export function createInsightsExecutor(agent: InsightsAgent = buildInsightsAgent()): AgentExecutor {
  return {
    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
      const text = userText(requestContext.userMessage) || "Provide an SLA risk report.";
      let reply: string;
      try {
        const result = await agent.invoke({ messages: [new HumanMessage(text)] });
        reply = agentText(result) || "(no response)";
      } catch (err) {
        reply = `The Insights agent hit an error: ${(err as Error).message}`;
      }

      eventBus.publish({
        kind: "message",
        messageId: randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: reply }],
        contextId: requestContext.contextId,
      });
      eventBus.finished();
    },
    async cancelTask(): Promise<void> {
      // Non-stateful, single-shot agent — nothing to cancel.
    },
  };
}
