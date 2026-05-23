import { z } from "zod";
import { zodState } from "@copilotkit/sdk-js/langgraph";
import type { AriaStep } from "@agentdemo/shared";

/**
 * The agent's live progress log — a small list of steps the rep watches stream
 * in the chat sidebar while Aria works ("Reading the ticket → Searching the
 * knowledge base → Drafting a reply"). It's distinct from the per-tool-call
 * activity chips: this is the *narrative* of the whole turn.
 *
 * It lives on the `ariaProgress` middleware's state (see graph.ts). `zodState`
 * is mandatory: without it LangGraph drops the field from the graph's
 * `output_schema`, and the CopilotKit AG-UI bridge filters it out of the
 * STATE_SNAPSHOT, so `useAgent().state.aria_steps` would never see it.
 */
export const AriaStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["running", "done"]),
  detail: z.string().optional(),
});

const ariaStepsSchema = z.array(AriaStepSchema).default(() => []);
// `zodState` augments the schema's `~standard` hook at runtime so the field is
// serialized into the graph output_schema (and thus the AG-UI STATE_SNAPSHOT).
// We annotate with the plain schema type: the augmentation is runtime-only, and
// naming its type would leak a non-portable zod internal path (TS2742).
export const ariaStepsState: typeof ariaStepsSchema = zodState(ariaStepsSchema) as typeof ariaStepsSchema;

/** Prefix marking the "Thinking…" steps so the reducer can find/close them. */
const THINK_PREFIX = "think";
/** Prefix marking tool-call steps (id derived from the tool-call id). */
const TOOL_PREFIX = "tool";

/**
 * Map a tool name to a friendly progress label. Mirrors (and extends) the
 * labels in the web `ToolActivityChip` so the timeline reads in plain English.
 * Unknown tools fall through to their raw name.
 */
export function stepLabelForTool(name: string): string {
  const labels: Record<string, string> = {
    // backend reads
    list_tickets: "Searching tickets",
    get_ticket: "Reading the ticket",
    list_customers: "Looking up customers",
    // DeepWiki MCP
    ask_question: "Searching the knowledge base",
    read_wiki_structure: "Browsing the knowledge base",
    read_wiki_contents: "Reading the knowledge base",
    // frontend actions (run in the browser)
    filterTickets: "Filtering the inbox",
    openTicket: "Opening the ticket",
    navigateTo: "Switching the view",
    openCustomer: "Opening the customer",
    setTicketStatus: "Updating status",
    setTicketPriority: "Updating priority",
    showTicketSummary: "Preparing a ticket summary",
    showCustomerSummary: "Preparing an account summary",
    showKnowledgeCitation: "Citing the knowledge base",
    draftReply: "Drafting a reply",
    createTicket: "Drafting a new ticket",
    changeCustomerPlan: "Preparing a plan change",
  };
  return labels[name] ?? name;
}

/** A pending tool call as seen on an AI message (`message.tool_calls`). */
export interface ToolCallLike {
  id?: string;
  name: string;
}

/** Events the reducer folds, one per agent lifecycle hook. */
export type StepEvent =
  | { type: "model-start" }
  | { type: "model-end"; toolCalls: ToolCallLike[] }
  | { type: "agent-end" };

const close = (s: AriaStep): AriaStep => (s.status === "running" ? { ...s, status: "done" } : s);

/**
 * Fold one lifecycle event into the step list. Pure and deterministic so it's
 * unit-testable and idempotent across a paused/resumed run:
 *  - model-start: any tool steps still "running" have finished (we're back at
 *    the model), so close them; then open a single "Thinking…" step.
 *  - model-end: close the open "Thinking…" step, then open one step per pending
 *    tool call. Tool-step ids derive from the tool-call id, so replaying the
 *    same call (e.g. a single-route HITL resume) never duplicates a step.
 *  - agent-end: close any steps left running so the panel settles.
 */
export function reduceSteps(prev: AriaStep[], event: StepEvent): AriaStep[] {
  switch (event.type) {
    case "model-start": {
      const next = prev.map((s) => (s.id.startsWith(TOOL_PREFIX) ? close(s) : s));
      const hasOpenThink = next.some((s) => s.id.startsWith(THINK_PREFIX) && s.status === "running");
      if (hasOpenThink) return next;
      return [...next, { id: `${THINK_PREFIX}-${next.length}`, label: "Thinking…", status: "running" }];
    }
    case "model-end": {
      let next = prev.map((s) => (s.id.startsWith(THINK_PREFIX) ? close(s) : s));
      for (const tc of event.toolCalls) {
        const id = `${TOOL_PREFIX}-${tc.id ?? tc.name}`;
        if (next.some((s) => s.id === id)) continue; // idempotent on resume
        next = [...next, { id, label: stepLabelForTool(tc.name), status: "running" }];
      }
      return next;
    }
    case "agent-end":
      return prev.map(close);
  }
}
