import { useState } from "react";
import { z } from "zod";
import {
  useAgentContext,
  useDefaultRenderTool,
  useFrontendTool,
  useHumanInTheLoop,
} from "@copilotkit/react-core/v2";
import { TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority } from "@agentdemo/shared";
import { useTickets } from "../state/TicketsProvider.js";
import {
  KnowledgeCitationCard,
  ReplyApprovalCard,
  TicketSummaryCard,
  ToolActivityChip,
} from "../components/cards.js";

/**
 * Wires the support-desk UI to the agent (CopilotKit v2 / AG-UI):
 *  - useAgentContext: makes the rep's current view legible to the agent
 *  - useFrontendTool: lets the agent drive the real UI + render generative cards
 *  - useHumanInTheLoop: reply drafting that waits for the rep's approval
 *
 * Renders nothing — pure wiring, mounted inside <CopilotKitProvider>.
 */
export function CopilotActions({ onFlash }: { onFlash: (id: string) => void }) {
  const { tickets, selected, filters, setFilters, selectTicket, patchTicket, sendMessage } =
    useTickets();

  // ── Share the rep's current view with the agent ──────────────────────────
  useAgentContext({
    description: "The tickets currently visible in the rep's inbox (filtered view)",
    value: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId ?? "unassigned",
    })),
  });
  useAgentContext({
    description: "The active inbox filters and the ticket the rep currently has open",
    value: JSON.stringify({ filters, openTicketId: selected?.id ?? null }),
  });

  // Backend tool calls (list_tickets, get_ticket, DeepWiki MCP) render as a
  // compact activity chip instead of dumping the raw tool result into the chat.
  useDefaultRenderTool({
    render: ({ name, status }) => (
      <ToolActivityChip name={name} status={status as "inProgress" | "executing" | "complete"} />
    ),
  });

  // ── Frontend tools: the agent drives the live UI ─────────────────────────
  useFrontendTool({
    name: "filterTickets",
    description: "Filter and sort the ticket inbox the rep is viewing.",
    parameters: z.object({
      status: z.enum(TICKET_STATUSES).optional().describe("Filter by ticket status"),
      priority: z.enum(TICKET_PRIORITIES).optional().describe("Filter by priority"),
      search: z.string().optional().describe("Free-text search over subject/body"),
      sort: z.enum(["newest", "oldest", "priority"]).optional(),
    }),
    handler: async ({ status, priority, search, sort }) => {
      setFilters({ status, priority, search, sort });
      return `Inbox filtered (${[status, priority, search].filter(Boolean).join(", ") || "cleared"}).`;
    },
  });

  useFrontendTool({
    name: "openTicket",
    description: "Open a specific ticket in the detail view so the rep can see it.",
    parameters: z.object({ ticketId: z.string().describe("The ticket id, e.g. T-1001") }),
    handler: async ({ ticketId }) => {
      selectTicket(ticketId);
      onFlash(ticketId);
      return `Opened ${ticketId}.`;
    },
  });

  useFrontendTool({
    name: "setTicketStatus",
    description: "Change a ticket's status. This persists immediately.",
    parameters: z.object({ ticketId: z.string(), status: z.enum(TICKET_STATUSES) }),
    handler: async ({ ticketId, status }) => {
      await patchTicket(ticketId, { status });
      return `${ticketId} is now ${status}.`;
    },
  });

  useFrontendTool({
    name: "setTicketPriority",
    description: "Change a ticket's priority. This persists immediately.",
    parameters: z.object({ ticketId: z.string(), priority: z.enum(TICKET_PRIORITIES) }),
    handler: async ({ ticketId, priority }) => {
      await patchTicket(ticketId, { priority });
      return `${ticketId} priority set to ${priority}.`;
    },
  });

  // ── Generative UI: rich cards rendered in the chat ───────────────────────
  useFrontendTool({
    name: "showTicketSummary",
    description: "Present a concise, structured summary of a ticket to the rep as a card.",
    parameters: z.object({
      ticketId: z.string(),
      summary: z.string().describe("1-2 sentence summary"),
      highlights: z.array(z.string()).optional().describe("Key points / facts"),
      suggestedPriority: z.enum(TICKET_PRIORITIES).optional(),
      sentiment: z.string().optional().describe("Customer sentiment, e.g. frustrated"),
    }),
    handler: async () => "Summary shown to the rep.",
    render: ({ args }) => (
      <TicketSummaryCard
        ticketId={args.ticketId ?? ""}
        summary={args.summary ?? "…"}
        highlights={args.highlights}
        suggestedPriority={args.suggestedPriority as TicketPriority | undefined}
        sentiment={args.sentiment}
      />
    ),
  });

  useFrontendTool({
    name: "showKnowledgeCitation",
    description: "Present an answer sourced from the DeepWiki knowledge base as a cited card.",
    parameters: z.object({
      question: z.string(),
      answer: z.string(),
      repo: z.string().optional().describe("Source repo, e.g. fastify/fastify"),
    }),
    handler: async () => "Citation shown to the rep.",
    render: ({ args }) => (
      <KnowledgeCitationCard question={args.question ?? ""} answer={args.answer ?? "…"} repo={args.repo} />
    ),
  });

  // ── Human-in-the-loop: draft a customer reply, wait for approval ─────────
  useHumanInTheLoop({
    name: "draftReply",
    description:
      "Draft a reply to the customer on a ticket. The rep must approve before it is sent. Use for all customer-facing messages.",
    parameters: z.object({
      ticketId: z.string(),
      message: z.string().describe("The proposed reply text"),
    }),
    render: ({ args, status, respond }) => (
      <DraftReplyApproval
        ticketId={args.ticketId ?? ""}
        message={args.message ?? ""}
        status={status as "inProgress" | "executing" | "complete"}
        onApprove={async () => {
          if (args.ticketId && args.message) await sendMessage(args.ticketId, args.message);
          respond?.("The reply was approved and sent to the customer.");
        }}
        onCancel={() => respond?.("The rep discarded the draft; nothing was sent.")}
      />
    ),
  });

  return null;
}

/** Approval card that tracks its own decided/outcome state (respond fires once). */
function DraftReplyApproval(props: {
  ticketId: string;
  message: string;
  status: "inProgress" | "executing" | "complete";
  onApprove: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<"sent" | "cancelled" | null>(null);
  return (
    <ReplyApprovalCard
      ticketId={props.ticketId}
      message={props.message}
      status={props.status}
      outcome={outcome}
      onApprove={async () => {
        setOutcome("sent");
        await props.onApprove();
      }}
      onCancel={() => {
        setOutcome("cancelled");
        props.onCancel();
      }}
    />
  );
}
