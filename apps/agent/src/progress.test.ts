import { describe, expect, it } from "vitest";
import { reduceSteps, stepLabelForTool, type StepEvent } from "./progress.js";
import type { AriaStep } from "@agentdemo/shared";

/** Fold a sequence of events from an empty log. */
function run(events: StepEvent[]): AriaStep[] {
  return events.reduce<AriaStep[]>((steps, e) => reduceSteps(steps, e), []);
}

describe("stepLabelForTool", () => {
  it("maps known backend, MCP, and frontend tools to friendly labels", () => {
    expect(stepLabelForTool("get_ticket")).toBe("Reading the ticket");
    expect(stepLabelForTool("ask_question")).toBe("Searching the knowledge base");
    expect(stepLabelForTool("draftReply")).toBe("Drafting a reply");
  });

  it("falls back to the raw name for unknown tools", () => {
    expect(stepLabelForTool("some_future_tool")).toBe("some_future_tool");
  });
});

describe("reduceSteps", () => {
  it("opens a single Thinking step on model-start", () => {
    const steps = run([{ type: "model-start" }]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ label: "Thinking…", status: "running" });
  });

  it("does not open a second Thinking step while one is already open", () => {
    const steps = run([{ type: "model-start" }, { type: "model-start" }]);
    expect(steps.filter((s) => s.label === "Thinking…")).toHaveLength(1);
  });

  it("closes Thinking and opens a labelled step per tool call on model-end", () => {
    const steps = run([
      { type: "model-start" },
      { type: "model-end", toolCalls: [{ id: "tc1", name: "get_ticket" }] },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ label: "Thinking…", status: "done" });
    expect(steps[1]).toMatchObject({ label: "Reading the ticket", status: "running" });
  });

  it("closes running tool steps when the model is called again", () => {
    const steps = run([
      { type: "model-start" },
      { type: "model-end", toolCalls: [{ id: "tc1", name: "get_ticket" }] },
      { type: "model-start" },
    ]);
    const toolStep = steps.find((s) => s.label === "Reading the ticket");
    expect(toolStep?.status).toBe("done");
  });

  it("closes every running step on agent-end", () => {
    const steps = run([
      { type: "model-start" },
      { type: "model-end", toolCalls: [{ id: "tc1", name: "get_ticket" }] },
      { type: "agent-end" },
    ]);
    expect(steps.every((s) => s.status === "done")).toBe(true);
  });

  it("is idempotent for a tool call replayed across a pause/resume (same id)", () => {
    const once = run([
      { type: "model-start" },
      { type: "model-end", toolCalls: [{ id: "tc1", name: "draftReply" }] },
    ]);
    // The resume leg replays the same model-end with the same tool-call id.
    const twice = reduceSteps(once, { type: "model-end", toolCalls: [{ id: "tc1", name: "draftReply" }] });
    expect(twice.filter((s) => s.label === "Drafting a reply")).toHaveLength(1);
  });
});
