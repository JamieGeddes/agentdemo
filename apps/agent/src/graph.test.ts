import { describe, expect, it } from "vitest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { buildAgent } from "./graph.js";

const fakeGetTicket = tool(async ({ id }) => JSON.stringify({ id }), {
  name: "get_ticket",
  description: "get a ticket",
  schema: z.object({ id: z.string() }),
});

describe("support agent", () => {
  it("compiles into a runnable graph with the backend tools bound", () => {
    // Construction does not call the model API, so a dummy key is fine here.
    const model = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", apiKey: "test-key" });
    const agent = buildAgent({ model, serverTools: [fakeGetTicket], mcpTools: [] });

    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe("function");
    expect(typeof agent.stream).toBe("function");
  });
});
