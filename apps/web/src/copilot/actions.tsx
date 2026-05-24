import { useCallback, useRef, useState } from "react";
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
  type TicketPatch,
  type TicketPriority,
} from "@agentdemo/shared";
import { useTickets } from "../state/TicketsProvider.js";
import { suggestionsForView } from "./suggestions.js";
import {
  ActivityRecapCard,
  batchActionLabel,
  BatchTriageApprovalCard,
  CustomerPlanApprovalCard,
  CustomerSummaryCard,
  KnowledgeCitationCard,
  RelatedTicketsCard,
  ReplyApprovalCard,
  TicketCreateApprovalCard,
  TicketSummaryCard,
  ToolActivityChip,
  TriageBoardCard,
  type BatchActionRow,
  type RowDecision,
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
    agents,
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
    agentOf,
    sendMessage,
    sessionId,
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
  useAgentContext({
    description:
      "The support team roster. Map a rep's name (e.g. \"Sofia\") to their id here, then pass that assigneeId to assignTicket.",
    value: agents.map((a) => ({ id: a.id, name: a.name })),
  });
  useAgentContext({
    description: "This browser session's id — pass it to list_activity to scope the recap to this session.",
    value: sessionId,
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

  useFrontendTool({
    name: "assignTicket",
    description:
      "Assign a ticket to a support rep by their agent id (e.g. a3). Resolve the rep's name to an id via the team roster first. This persists immediately.",
    parameters: z.object({
      ticketId: z.string(),
      assigneeId: z.string().describe("The rep's agent id, e.g. a3"),
    }),
    handler: async ({ ticketId, assigneeId }) => {
      setView("inbox");
      await patchTicket(ticketId, { assigneeId });
      const name = agentOf(assigneeId)?.name ?? assigneeId;
      return `${ticketId} assigned to ${name}.`;
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
    description:
      "Present an answer sourced from a knowledge base as a cited card. Set source to where it came from.",
    parameters: z.object({
      question: z.string(),
      answer: z.string(),
      source: z.enum(["DeepWiki", "Runbook"]).optional().describe("Which knowledge base the answer came from"),
      reference: z.string().optional().describe("The specific source, e.g. 'fastify/fastify' or 'rb-webhook-hmac'"),
    }),
    handler: async () => "Citation shown to the rep.",
    render: ({ args, status }) => (
      <KnowledgeCitationCard
        question={args.question ?? ""}
        answer={args.answer ?? ""}
        source={args.source}
        reference={args.reference}
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

  useFrontendTool({
    name: "showTriageBoard",
    description:
      "Show a ranked triage board: tickets with their SLA risk, priority and a proposed action. Use to present the queue before (or instead of) proposing writes.",
    parameters: z.object({
      rows: z.array(
        z.object({
          ticketId: z.string(),
          company: z.string().optional(),
          slaRisk: z.enum(["ok", "warning", "breach"]).optional().describe("SLA-breach risk level"),
          priority: z.enum(TICKET_PRIORITIES).optional(),
          proposedAction: z.string().optional().describe("Short label, e.g. 'escalate to urgent'"),
          reason: z.string().optional().describe("Why — cite SLA risk / plan tier"),
        }),
      ),
    }),
    handler: async () => "Triage board shown to the rep.",
    render: ({ args, status }) => (
      <TriageBoardCard
        rows={(args.rows ?? []) as Parameters<typeof TriageBoardCard>[0]["rows"]}
        status={status as "inProgress" | "executing" | "complete"}
      />
    ),
  });

  useFrontendTool({
    name: "showRelatedTickets",
    description:
      "Show a set of tickets you've correlated (same customer, same root cause, recurring theme) with a one-line explanation of the connection a human might miss.",
    parameters: z.object({
      connection: z.string().describe("The pattern / connection, e.g. 'Both Globex tickets are frontend perf/timeout issues'"),
      ticketIds: z.array(z.string()).optional(),
      rows: z
        .array(
          z.object({
            ticketId: z.string(),
            subject: z.string().optional(),
            note: z.string().optional().describe("How this ticket fits the pattern"),
          }),
        )
        .optional(),
    }),
    handler: async () => "Related tickets shown to the rep.",
    render: ({ args, status }) => (
      <RelatedTicketsCard
        connection={args.connection ?? ""}
        ticketIds={args.ticketIds}
        rows={args.rows as Parameters<typeof RelatedTicketsCard>[0]["rows"]}
        status={status as "inProgress" | "executing" | "complete"}
      />
    ),
  });

  useFrontendTool({
    name: "showActivityRecap",
    description:
      "Show a recap of what was done this session, as a card. Call list_activity first, then pass its entries here.",
    parameters: z.object({
      items: z.array(
        z.object({
          summary: z.string(),
          ticketId: z.string().optional(),
          kind: z.string().optional(),
        }),
      ),
    }),
    handler: async () => "Session recap shown to the rep.",
    render: ({ args, status }) => (
      <ActivityRecapCard
        items={(args.items ?? []) as Parameters<typeof ActivityRecapCard>[0]["items"]}
        status={status as "inProgress" | "executing" | "complete"}
      />
    ),
  });

  // ── Human-in-the-loop: propose a batch of triage actions, wait for approval ─
  useHumanInTheLoop({
    name: "proposeTicketActions",
    description:
      "Propose a batch of ticket changes for the rep to approve in ONE card: reprioritize (setPriority), escalate (→ urgent), set status (setStatus), or assign to a rep (assign). Use this for triage. The rep can approve all, approve individual rows, or discard. Each action needs a per-row reason citing SLA risk / priority. Resolve rep names to assigneeId via the team roster.",
    parameters: z.object({
      rationale: z.string().describe("One-line why, e.g. 'SLA-breach triage of the open queue'"),
      actions: z
        .array(
          z.object({
            id: z.string().describe("A stable per-row id you assign, e.g. r1, r2"),
            kind: z.enum(["setPriority", "setStatus", "assign", "escalate"]),
            ticketId: z.string(),
            priority: z.enum(TICKET_PRIORITIES).optional().describe("For setPriority"),
            status: z.enum(TICKET_STATUSES).optional().describe("For setStatus"),
            assigneeId: z.string().optional().describe("For assign — the rep's agent id, e.g. a3"),
            assigneeName: z.string().optional().describe("For assign — the rep's display name"),
            reason: z.string().describe("Why this action — cite SLA risk / priority"),
          }),
        )
        .min(1),
    }),
    render: ({ args, status, respond }) => (
      <BatchTriageApproval
        rationale={args.rationale ?? ""}
        actions={(args.actions ?? []) as BatchActionRow[]}
        status={status as "inProgress" | "executing" | "complete"}
        patchTicket={patchTicket}
        respond={respond}
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

/**
 * Wrapper for the batch-triage HITL tool. Per-row Approve applies the write
 * immediately (idempotent — guarded by `appliedRef`, and the underlying PATCH
 * sets absolute values, so a single-route resume can't double-apply). The tool
 * call resolves exactly once, when the rep finalizes (approve-all / finish /
 * discard), with a summary string the model reads next turn.
 */
function BatchTriageApproval(props: {
  rationale: string;
  actions: BatchActionRow[];
  status: "inProgress" | "executing" | "complete";
  patchTicket: (id: string, patch: TicketPatch) => Promise<void>;
  respond?: (msg: string) => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [terminal, setTerminal] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const appliedRef = useRef<Set<string>>(new Set());

  const applyAction = useCallback(
    async (a: BatchActionRow) => {
      if (appliedRef.current.has(a.id)) return;
      appliedRef.current.add(a.id);
      switch (a.kind) {
        case "setPriority":
          if (a.priority) await props.patchTicket(a.ticketId, { priority: a.priority });
          break;
        case "escalate":
          await props.patchTicket(a.ticketId, { priority: "urgent" });
          break;
        case "setStatus":
          if (a.status) await props.patchTicket(a.ticketId, { status: a.status });
          break;
        case "assign":
          if (a.assigneeId) await props.patchTicket(a.ticketId, { assigneeId: a.assigneeId });
          break;
      }
    },
    [props],
  );

  const finalize = (final: Record<string, RowDecision>) => {
    if (terminal) return;
    const approved = props.actions.filter((a) => final[a.id] === "approved");
    const skipped = props.actions.filter((a) => final[a.id] === "skipped");
    const parts: string[] = [];
    parts.push(
      `Rep approved ${approved.length} of ${props.actions.length}` +
        (approved.length ? `: ${approved.map((a) => `${a.ticketId} ${batchActionLabel(a)}`).join(", ")}.` : "."),
    );
    if (skipped.length) parts.push(`Skipped: ${skipped.map((a) => a.ticketId).join(", ")}.`);
    const msg = parts.join(" ");
    setSummary(msg);
    setTerminal(true);
    props.respond?.(msg);
  };

  const approveRow = async (id: string) => {
    const a = props.actions.find((x) => x.id === id);
    if (!a) return;
    await applyAction(a);
    setDecisions((d) => ({ ...d, [id]: "approved" }));
  };
  const skipRow = (id: string) => setDecisions((d) => ({ ...d, [id]: "skipped" }));

  const approveAll = async () => {
    const next: Record<string, RowDecision> = { ...decisions };
    for (const a of props.actions) {
      if ((next[a.id] ?? "pending") === "skipped") continue;
      await applyAction(a);
      next[a.id] = "approved";
    }
    setDecisions(next);
    finalize(next);
  };

  // Commit current per-row choices; anything still pending counts as skipped.
  const finish = () => {
    const next: Record<string, RowDecision> = { ...decisions };
    for (const a of props.actions) if (!next[a.id]) next[a.id] = "skipped";
    setDecisions(next);
    finalize(next);
  };

  const discardAll = () => {
    const next: Record<string, RowDecision> = {};
    for (const a of props.actions) next[a.id] = "skipped";
    setDecisions(next);
    finalize(next);
  };

  return (
    <BatchTriageApprovalCard
      rationale={props.rationale}
      actions={props.actions}
      decisions={decisions}
      status={props.status}
      terminal={terminal}
      summary={summary}
      onApproveRow={approveRow}
      onSkipRow={skipRow}
      onApproveAll={approveAll}
      onFinish={finish}
      onDiscardAll={discardAll}
    />
  );
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
