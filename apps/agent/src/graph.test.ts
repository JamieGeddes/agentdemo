import { describe, expect, it } from "vitest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { buildAgent, makeModel } from "./graph.js";

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

describe("makeModel backend selection", () => {
  // Construction makes no network/auth call, so no key or ADC is needed here.
  it("builds an API-key model for the gemini-api backend", () => {
    expect(makeModel("gemini-api")).toBeInstanceOf(ChatGoogleGenerativeAI);
  });

  it("builds a Vertex AI model for the vertex backend", () => {
    expect(makeModel("vertex")).toBeInstanceOf(ChatVertexAI);
  });

  it("does not pick up GOOGLE_API_KEY when building the vertex backend", () => {
    // @langchain/google-common falls back to GOOGLE_API_KEY from the env when
    // `apiKey` is nullish, which would silently switch Vertex to API-key auth
    // (and Vertex rejects that with 401). Guard against the regression.
    const prev = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = "leaked-key-should-be-ignored";
    try {
      const model = makeModel("vertex") as unknown as {
        connection: { client: { constructor: { name: string } } };
      };
      expect(model.connection.client.constructor.name).not.toBe("ApiKeyGoogleAuth");
      expect(model.connection.client.constructor.name).toBe("GAuthClient");
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = prev;
    }
  });

  it("throws on an unknown backend", () => {
    expect(() => makeModel("bogus")).toThrow(/Unknown LLM_BACKEND/);
  });
});
