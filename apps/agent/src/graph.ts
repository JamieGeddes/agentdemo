import { createAgent, createMiddleware } from "langchain";
import { copilotkitMiddleware } from "@copilotkit/sdk-js/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { env } from "./env.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { createServerTools } from "./tools/server.js";
import { loadDeepwikiTools } from "./tools/mcp.js";

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
    // mergeSystemMessages runs after copilotkitMiddleware so it sees (and folds
    // in) the injected app-context system message.
    middleware: [copilotkitMiddleware, mergeSystemMessages],
    systemPrompt: SYSTEM_PROMPT,
  });
}

/** Factory used by `langgraph.json` to instantiate the graph for the dev server. */
export async function makeGraph() {
  return buildAgent({ mcpTools: await loadDeepwikiTools() });
}
