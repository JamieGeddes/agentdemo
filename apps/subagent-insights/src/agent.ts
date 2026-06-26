import { createAgent } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { makeModel } from "./model.js";
import { createInsightsTools } from "./tools.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export interface BuildInsightsOptions {
  model?: BaseChatModel;
  tools?: StructuredToolInterface[];
}

/** Build the Insights LangGraph agent (Gemini + the role-gated reporting tools). */
export function buildInsightsAgent(opts: BuildInsightsOptions = {}) {
  return createAgent({
    model: opts.model ?? makeModel(),
    tools: opts.tools ?? createInsightsTools(),
    systemPrompt: SYSTEM_PROMPT,
  }).withConfig({ recursionLimit: 25 });
}
