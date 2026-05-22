import { useState } from "react";
import { z } from "zod";
import {
  useAgentContext,
  useConfigureSuggestions,
  useDefaultRenderTool,
  useFrontendTool,
  useHumanInTheLoop,
} from "@copilotkit/react-core/v2";
import {
  CUSTOMER_PLANS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type CustomerPlan,
  type TicketPriority,
} from "@agentdemo/shared";
import { useTickets } from "../state/TicketsProvider.js";
import { suggestionsForView } from "./suggestions.js";
import {
  CustomerPlanApprovalCard,
  CustomerSummaryCard,
  KnowledgeCitationCard,
  ReplyApprovalCard,
  TicketCreateApprovalCard,
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
  const {
    tickets,
    customers,
    selected,
    filters,
    view,
    selectedCustomer,
    setView,
    selectCustomer,
    patchCustomer,
    setFilters,
    selectTicket,
    patchTicket,
    addTicket,
    findCustomerByName,
    sendMessage,
  } = useTickets();

  // ── Share the rep's current view with the agent ──────────────────────────
  useAgentContext({
    description: "Tickets matching the rep's current inbox filters",
    value: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId ?? "unassigned",
    })),
  });
  useAgentContext({
    description:
      "Customers in the system (pass the company name to createTicket / openCustomer / changeCustomerPlan)",
    value: customers.map((c) => ({ company: c.company, plan: c.plan, slaTier: c.slaTier })),
  });
  // The rep's live UI state, gated on the active page so the open ticket /
  // customer can never contradict the page (selections persist across view
  // switches, so only report the one the rep is actually looking at).
  useAgentContext({
    description:
      "The rep's CURRENT UI state — the page showing now, the active inbox filters, " +
      "and what is open. This is the ground truth; trust it over anything inferred " +
      "from earlier turns or tool calls.",
    value: JSON.stringify({
      page: view, // "inbox" | "customers"
      inbox: view === "inbox" ? { filters, openTicketId: selected?.id ?? null } : null,
      customers: view === "customers" ? { openCustomer: selectedCustomer?.company ?? null } : null,
    }),
  });

  // ── Contextual next-best-action chips, derived from the rep's view ───────
  // Static (deterministic) suggestions, recomputed when the view/selection
  // changes via the deps array — no extra LLM round-trip.
  useConfigureSuggestions(
    {
      available: "always",
      suggestions: suggestionsForView({
        view,
        selectedTicketId: selected?.id ?? null,
        selectedCustomer: selectedCustomer?.company ?? null,
      }),
    },
    [view, selected?.id, selectedCustomer?.company],
  );

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
      setView("inbox");
      setFilters({ status, priority, search, sort });
      return `Inbox filtered (${[status, priority, search].filter(Boolean).join(", ") || "cleared"}).`;
    },
  });

  useFrontendTool({
    name: "openTicket",
    description: "Open a specific ticket in the detail view so the rep can see it.",
    parameters: z.object({ ticketId: z.string().describe("The ticket id, e.g. T-1001") }),
    handler: async ({ ticketId }) => {
      setView("inbox");
      selectTicket(ticketId);
      onFlash(ticketId);
      return `Opened ${ticketId}.`;
    },
  });

  useFrontendTool({
    name: "navigateTo",
    description: "Switch the page the rep is viewing.",
    parameters: z.object({ page: z.enum(["inbox", "customers"]) }),
    handler: async ({ page }) => {
      setView(page);
      return `Showing the ${page} page.`;
    },
  });

  useFrontendTool({
    name: "openCustomer",
    description: "Open a customer's account on the Customers page, by company name.",
    parameters: z.object({ company: z.string().describe("The company name, e.g. Acme Robotics") }),
    handler: async ({ company }) => {
      const match = findCustomerByName(company);
      if (!match) return `No customer matches "${company}".`;
      setView("customers");
      selectCustomer(match.id);
      return `Opened ${match.company}.`;
    },
  });

  useFrontendTool({
    name: "setTicketStatus",
    description: "Change a ticket's status. This persists immediately.",
    parameters: z.object({ ticketId: z.string(), status: z.enum(TICKET_STATUSES) }),
    handler: async ({ ticketId, status }) => {
      setView("inbox");
      await patchTicket(ticketId, { status });
      return `${ticketId} is now ${status}.`;
    },
  });

  useFrontendTool({
    name: "setTicketPriority",
    description: "Change a ticket's priority. This persists immediately.",
    parameters: z.object({ ticketId: z.string(), priority: z.enum(TICKET_PRIORITIES) }),
    handler: async ({ ticketId, priority }) => {
      setView("inbox");
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
    render: ({ args, status }) => (
      <TicketSummaryCard
        ticketId={args.ticketId ?? ""}
        summary={args.summary ?? ""}
        highlights={args.highlights}
        suggestedPriority={args.suggestedPriority as TicketPriority | undefined}
        sentiment={args.sentiment}
        status={status as "inProgress" | "executing" | "complete"}
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
    render: ({ args, status }) => (
      <KnowledgeCitationCard
        question={args.question ?? ""}
        answer={args.answer ?? ""}
        repo={args.repo}
        status={status as "inProgress" | "executing" | "complete"}
      />
    ),
  });

  useFrontendTool({
    name: "showCustomerSummary",
    description: "Present an account-health summary of a customer to the rep as a card.",
    parameters: z.object({
      company: z.string().describe("The customer's company name"),
      summary: z.string().describe("1-2 sentence account summary"),
      highlights: z.array(z.string()).optional().describe("Key points / facts"),
      plan: z.enum(CUSTOMER_PLANS).optional(),
      slaTier: z.string().optional().describe("Response SLA, e.g. 1h"),
      openTickets: z.number().optional().describe("Count of their open tickets"),
    }),
    handler: async () => "Account summary shown to the rep.",
    render: ({ args, status }) => (
      <CustomerSummaryCard
        company={args.company ?? ""}
        summary={args.summary ?? ""}
        highlights={args.highlights}
        plan={args.plan as CustomerPlan | undefined}
        slaTier={args.slaTier}
        openTickets={args.openTickets}
        status={status as "inProgress" | "executing" | "complete"}
      />
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

  // ── Human-in-the-loop: propose a new ticket, wait for the rep's approval ──
  useHumanInTheLoop({
    name: "createTicket",
    description:
      "Propose a new support ticket for a customer. The rep must approve before it is created. Pass the customer's company name (e.g. \"Globex Corp\").",
    parameters: z.object({
      subject: z.string().describe("Short subject line for the ticket"),
      body: z.string().describe("The issue description / opening details"),
      customerName: z.string().describe("The customer's company name, e.g. Globex Corp"),
      priority: z.enum(TICKET_PRIORITIES).optional().describe("Defaults to normal"),
    }),
    render: ({ args, status, respond }) => {
      const name = args.customerName ?? "";
      const match = findCustomerByName(name);
      const priority = (args.priority as TicketPriority | undefined) ?? "normal";
      return (
        <TicketCreateApproval
          subject={args.subject ?? ""}
          body={args.body ?? ""}
          priority={priority}
          customerName={name}
          resolvedCompany={match?.company ?? null}
          status={status as "inProgress" | "executing" | "complete"}
          onApprove={async () => {
            if (!match) {
              respond?.(`No customer matches "${name}"; nothing was created.`);
              return null;
            }
            const created = await addTicket({
              subject: args.subject ?? "",
              body: args.body ?? "",
              priority,
              customerId: match.id,
            });
            onFlash(created.id);
            respond?.(`Created ${created.id} for ${match.company}.`);
            return created.id;
          }}
          onCancel={() => respond?.("The rep discarded the new ticket; nothing was created.")}
        />
      );
    },
  });

  // ── Human-in-the-loop: change a customer's plan, wait for approval ────────
  useHumanInTheLoop({
    name: "changeCustomerPlan",
    description:
      "Change a customer's plan (free/pro/enterprise). The rep must approve before it persists. Pass the customer's company name.",
    parameters: z.object({
      company: z.string().describe("The customer's company name, e.g. Globex Corp"),
      plan: z.enum(CUSTOMER_PLANS).describe("The target plan"),
    }),
    render: ({ args, status, respond }) => {
      const company = args.company ?? "";
      const match = findCustomerByName(company);
      const nextPlan = (args.plan as CustomerPlan | undefined) ?? "pro";
      return (
        <ChangePlanApproval
          company={match?.company ?? company}
          currentPlan={match?.plan ?? null}
          nextPlan={nextPlan}
          status={status as "inProgress" | "executing" | "complete"}
          onApprove={async () => {
            if (!match) {
              respond?.(`No customer matches "${company}"; nothing was changed.`);
              return false;
            }
            await patchCustomer(match.id, { plan: nextPlan });
            respond?.(`${match.company} is now on the ${nextPlan} plan.`);
            return true;
          }}
          onCancel={() => respond?.("The rep declined the plan change; nothing was changed.")}
        />
      );
    },
  });

  return null;
}

/** Approval card for an agent-proposed plan change (respond fires once). */
function ChangePlanApproval(props: {
  company: string;
  currentPlan: CustomerPlan | null;
  nextPlan: CustomerPlan;
  status: "inProgress" | "executing" | "complete";
  onApprove: () => Promise<boolean> | boolean;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<"changed" | "cancelled" | null>(null);
  return (
    <CustomerPlanApprovalCard
      company={props.company}
      currentPlan={props.currentPlan}
      nextPlan={props.nextPlan}
      status={props.status}
      outcome={outcome}
      onApprove={async () => {
        const ok = await props.onApprove();
        if (ok) setOutcome("changed");
      }}
      onCancel={() => {
        setOutcome("cancelled");
        props.onCancel();
      }}
    />
  );
}

/** Approval card for an agent-proposed new ticket (respond fires once). */
function TicketCreateApproval(props: {
  subject: string;
  body: string;
  priority: TicketPriority;
  customerName: string;
  resolvedCompany: string | null;
  status: "inProgress" | "executing" | "complete";
  onApprove: () => Promise<string | null> | string | null;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<"created" | "cancelled" | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  return (
    <TicketCreateApprovalCard
      subject={props.subject}
      body={props.body}
      priority={props.priority}
      customerName={props.customerName}
      resolvedCompany={props.resolvedCompany}
      status={props.status}
      outcome={outcome}
      createdId={createdId}
      onApprove={async () => {
        const id = await props.onApprove();
        if (id) {
          setCreatedId(id);
          setOutcome("created");
        }
      }}
      onCancel={() => {
        setOutcome("cancelled");
        props.onCancel();
      }}
    />
  );
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
