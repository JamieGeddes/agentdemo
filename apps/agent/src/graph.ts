import { createAgent } from "langchain";
import { copilotkitMiddleware } from "@copilotkit/sdk-js/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "./env.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { createServerTools } from "./tools/server.js";
import { loadDeepwikiTools } from "./tools/mcp.js";

function makeModel(): BaseChatModel {
  return new ChatGoogleGenerativeAI({
    model: env.geminiModel,
    apiKey: env.googleApiKey,
    temperature: 0,
  });
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
    middleware: [copilotkitMiddleware],
    systemPrompt: SYSTEM_PROMPT,
  });
}

/** Factory used by `langgraph.json` to instantiate the graph for the dev server. */
export async function makeGraph() {
  return buildAgent({ mcpTools: await loadDeepwikiTools() });
}
