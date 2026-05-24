import { createAgent, createMiddleware } from "langchain";
import { copilotkitMiddleware } from "@copilotkit/sdk-js/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { env } from "./env.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { createServerTools } from "./tools/server.js";
import { loadMcpTools } from "./tools/mcp.js";
import { ariaStepsState, reduceSteps, type ToolCallLike } from "./progress.js";

/**
 * Gemini accepts exactly one system message, and it must be first. But
 * copilotkitMiddleware injects the app context (from `useAgentContext`) as an
 * additional system message, which — alongside createAgent's systemPrompt —
 * makes two. This middleware merges every system message into a single leading
 * one just before the model call, so the context works without erroring.
 */
const mergeSystemMessages = createMiddleware({
  name: "mergeSystemMessages",
  wrapModelCall: async (request, handler) => {
    const parts: string[] = [];
    const base = request.systemMessage;
    const baseText = typeof base?.content === "string" ? base.content : "";
    if (baseText.trim()) parts.push(baseText);

    const rest = [];
    for (const m of request.messages) {
      if (m.getType() === "system") {
        const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        if (c.trim()) parts.push(c);
      } else {
        rest.push(m);
      }
    }

    return handler({
      ...request,
      systemMessage: new SystemMessage(parts.join("\n\n")),
      messages: rest,
    });
  },
});

/**
 * Streams a live progress log to the chat sidebar. It owns one extra piece of
 * agent state, `aria_steps`, and updates it from the lifecycle hooks that can
 * return a state patch (`beforeModel` / `afterModel` / `afterAgent`). We avoid
 * `wrapToolCall` deliberately — it can only return a ToolMessage|Command, not a
 * state patch, so it can't append to `aria_steps` cleanly.
 *
 * `exposeState` on `copilotkitMiddleware` stays at its default (false), so this
 * log is rendered for the rep but never fed back into Gemini's prompt.
 */
const ariaProgress = createMiddleware({
  name: "ariaProgress",
  stateSchema: z.object({ aria_steps: ariaStepsState }),
  beforeModel: async (state) => ({
    aria_steps: reduceSteps(state.aria_steps ?? [], { type: "model-start" }),
  }),
  afterModel: async (state) => {
    const messages = state.messages ?? [];
    const last = messages[messages.length - 1];
    // Duck-type the tool calls rather than `instanceof AIMessage`: the message
    // can be an AIMessage from a different copy of @langchain/core, so the
    // instance check fails silently and we'd miss every tool step.
    const toolCalls = ((last as { tool_calls?: ToolCallLike[] } | undefined)?.tool_calls ?? []) as ToolCallLike[];
    return { aria_steps: reduceSteps(state.aria_steps ?? [], { type: "model-end", toolCalls }) };
  },
  afterAgent: async (state) => ({
    aria_steps: reduceSteps(state.aria_steps ?? [], { type: "agent-end" }),
  }),
});

/**
 * Build the Gemini chat model for the configured backend. Both paths return the
 * same `BaseChatModel` interface, so the graph downstream is backend-agnostic.
 * - "gemini-api": Google AI Studio key (`GOOGLE_API_KEY`).
 * - "vertex": Vertex AI via Application Default Credentials (no key in env;
 *   `gcloud auth application-default login` locally, or the GCP service account).
 */
export function makeModel(backend: string = env.llmBackend): BaseChatModel {
  switch (backend) {
    case "gemini-api":
      return new ChatGoogleGenerativeAI({
        model: env.geminiModel,
        apiKey: env.googleApiKey,
        temperature: 0,
      });
    case "vertex":
      return new ChatVertexAI({
        model: env.geminiModel,
        // Force an empty key so @langchain/google-common does NOT fall back to
        // process.env.GOOGLE_API_KEY (set for the gemini-api backend). An empty
        // string is falsy there, so it uses ADC instead of switching to API-key
        // auth — which Vertex rejects.
        apiKey: "",
        temperature: 0,
        location: env.vertexLocation,
        ...(env.vertexProject ? { authOptions: { projectId: env.vertexProject } } : {}),
      });
    default:
      throw new Error(
        `Unknown LLM_BACKEND "${backend}". Valid values: "gemini-api", "vertex".`,
      );
  }
}

export interface BuildAgentOptions {
  model?: BaseChatModel;
  serverTools?: StructuredToolInterface[];
  mcpTools?: StructuredToolInterface[];
}

/**
 * Build the support agent (LangChain's prebuilt ReAct agent + CopilotKit middleware).
 *
 * `copilotkitMiddleware` is the supported AG-UI bridge: it surfaces the
 * CopilotKit *frontend actions* (registered in the web app) to the model as
 * client-side tools and routes their calls back to the browser, while emitting
 * messages/state in the AG-UI format the CopilotKit v2 client renders. We only
 * supply the backend tools here: ticket reads + the DeepWiki MCP tools.
 */
export function buildAgent(opts: BuildAgentOptions = {}) {
  const model = opts.model ?? makeModel();
  const serverTools = opts.serverTools ?? createServerTools();
  const mcpTools = opts.mcpTools ?? [];
  return createAgent({
    model,
    tools: [...serverTools, ...mcpTools],
    // Order matters: copilotkitMiddleware owns the AG-UI bridge (and emits the
    // STATE_SNAPSHOT that carries aria_steps); ariaProgress writes that state;
    // mergeSystemMessages stays LAST so it folds in every system message just
    // before the model call (Gemini accepts only one).
    middleware: [copilotkitMiddleware, ariaProgress, mergeSystemMessages],
    systemPrompt: SYSTEM_PROMPT,
  });
}

/** Factory used by `langgraph.json` to instantiate the graph for the dev server. */
export async function makeGraph() {
  return buildAgent({ mcpTools: await loadMcpTools() });
}
