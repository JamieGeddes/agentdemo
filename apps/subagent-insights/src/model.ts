import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { env } from "./env.js";

/**
 * Build the Gemini chat model for the configured backend — a copy of the main
 * agent's `makeModel` so this subagent stays a self-contained workspace (it
 * runs its own LLM loop). Both backends return the same `BaseChatModel`.
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
        apiKey: "",
        temperature: 0,
        location: env.vertexLocation,
        ...(env.vertexProject ? { authOptions: { projectId: env.vertexProject } } : {}),
      });
    default:
      throw new Error(`Unknown LLM_BACKEND "${backend}". Valid values: "gemini-api", "vertex".`);
  }
}
