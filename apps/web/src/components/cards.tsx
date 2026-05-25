import type { ReactNode } from "react";
import type { CustomerPlan, SlaLevel, TicketPriority, TicketStatus } from "@agentdemo/shared";
import { PlanBadge, PriorityPill, SlaRiskPill, StatusPill } from "./pills.js";

/** Status a generative card receives while its args stream in from the model. */
type RenderStatus = "inProgress" | "executing" | "complete";

/** Per-row decision in a batch-triage approval. */
export type RowDecision = "pending" | "approved" | "skipped";

/** One proposed change in a batch-triage plan (mirrors the proposeTicketActions schema). */
export interface BatchActionRow {
  id: string;
  kind: "setPriority" | "setStatus" | "assign" | "escalate";
  ticketId: string;
  priority?: TicketPriority;
  status?: TicketStatus;
  assigneeId?: string;
  assigneeName?: string;
  reason?: string;
}

/** Plain-text label for a proposed action — used in the approval summary string. */
export function batchActionLabel(a: BatchActionRow): string {
  switch (a.kind) {
    case "setPriority":
      return `priority → ${a.priority ?? "?"}`;
    case "escalate":
      return "escalated → urgent";
    case "setStatus":
      return `status → ${a.status ?? "?"}`;
    case "assign":
      return `assigned → ${a.assigneeName ?? a.assigneeId ?? "rep"}`;
  }
}

/** The verb + pill/value shown for a proposed action in the triage card. */
function describeAction(a: BatchActionRow): { verb: string; value: ReactNode } {
  switch (a.kind) {
    case "setPriority":
      return { verb: "Priority", value: a.priority ? <PriorityPill priority={a.priority} /> : <>—</> };
    case "escalate":
      return { verb: "Escalate", value: <PriorityPill priority="urgent" /> };
    case "setStatus":
      return { verb: "Status", value: a.status ? <StatusPill status={a.status} /> : <>—</> };
    case "assign":
      return { verb: "Assign", value: <b>{a.assigneeName ?? a.assigneeId ?? "rep"}</b> };
  }
}

/** Shimmer placeholder shown while a card's content is still streaming. */
function CardSkeleton() {
  return (
    <>
      <div className="gcard__skeleton gcard__skeleton--wide" />
      <div className="gcard__skeleton gcard__skeleton--mid" />
      <div className="gcard__skeleton gcard__skeleton--short" />
    </>
  );
}

/** Rich ticket summary card the agent renders in-chat (generative UI). */
export function TicketSummaryCard(props: {
  ticketId: string;
  summary: string;
  highlights?: string[];
  suggestedPriority?: TicketPriority;
  sentiment?: string;
  status?: RenderStatus;
}) {
  // While args are still streaming we don't have a summary yet — show a skeleton
  // rather than an empty card, so the rep sees the card take shape.
  if (props.status === "inProgress" && !props.summary) {
    return (
      <div className="gcard">
        <div className="gcard__label">◆ Ticket summary{props.ticketId ? ` · ${props.ticketId}` : ""}</div>
        <CardSkeleton />
      </div>
    );
  }
  return (
    <div className="gcard">
      <div className="gcard__label">◆ Ticket summary · {props.ticketId}</div>
      <p className="gcard__text">{props.summary}</p>
      {props.highlights && props.highlights.length > 0 && (
        <ul className="gcard__list">
          {props.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      <div className="gcard__row">
        {props.suggestedPriority && (
          <>
            <span style={{ fontSize: 12, color: "var(--slate-500)" }}>Suggested priority:</span>
            <PriorityPill priority={props.suggestedPriority} />
          </>
        )}
        {props.sentiment && (
          <span style={{ fontSize: 12, color: "var(--slate-500)" }}>· Sentiment: {props.sentiment}</span>
        )}
      </div>
    </div>
  );
}

/** Account-health summary card the agent renders in-chat for a customer. */
export function CustomerSummaryCard(props: {
  company: string;
  plan?: CustomerPlan;
  slaTier?: string;
  openTickets?: number;
  summary: string;
  highlights?: string[];
  status?: RenderStatus;
}) {
  if (props.status === "inProgress" && !props.summary) {
    return (
      <div className="gcard">
        <div className="gcard__label">◍ Account{props.company ? ` · ${props.company}` : ""}</div>
        <CardSkeleton />
      </div>
    );
  }
  return (
    <div className="gcard">
      <div className="gcard__label">◍ Account · {props.company}</div>
      <p className="gcard__text">{props.summary}</p>
      {props.highlights && props.highlights.length > 0 && (
        <ul className="gcard__list">
          {props.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      <div className="gcard__row">
        {props.plan && <PlanBadge plan={props.plan} />}
        {props.slaTier && (
          <span style={{ fontSize: 12, color: "var(--slate-500)" }}>· SLA: {props.slaTier}</span>
        )}
        {props.openTickets != null && (
          <span style={{ fontSize: 12, color: "var(--slate-500)" }}>
            · {props.openTickets} open tickets
          </span>
        )}
      </div>
    </div>
  );
}

/** Human-in-the-loop approval card for an agent-proposed customer plan change. */
export function CustomerPlanApprovalCard(props: {
  company: string;
  currentPlan: CustomerPlan | null;
  nextPlan: CustomerPlan;
  status: "executing" | "complete" | "inProgress";
  onApprove: () => void;
  onCancel: () => void;
  outcome?: "changed" | "cancelled" | null;
}) {
  const decided = props.outcome != null || props.status === "complete";
  const resolved = props.currentPlan != null;
  return (
    <div className="gcard approve">
      <div className="gcard__label">◍ Plan change · {props.company}</div>
      <div className="gcard__row">
        {props.currentPlan && <PlanBadge plan={props.currentPlan} />}
        <span style={{ fontSize: 12, color: "var(--slate-500)" }}>→</span>
        <PlanBadge plan={props.nextPlan} />
        {!resolved && (
          <span style={{ fontSize: 12, color: "var(--red)" }}>· No matching customer</span>
        )}
      </div>
      {!decided ? (
        <div className="approve__actions">
          <button className="btn" onClick={props.onApprove} disabled={!resolved}>
            Approve &amp; apply
          </button>
          <button className="btn btn--danger" onClick={props.onCancel}>Discard</button>
        </div>
      ) : (
        <div
          className={`approve__status ${props.outcome === "changed" ? "approve__status--sent" : "approve__status--cancelled"}`}
        >
          {props.outcome === "changed" ? `✓ ${props.company} is now ${props.nextPlan}` : "No change made"}
        </div>
      )}
    </div>
  );
}

/** Knowledge-base answer card with a source citation (DeepWiki MCP or an internal runbook). */
export function KnowledgeCitationCard(props: {
  question: string;
  answer: string;
  source?: "DeepWiki" | "Runbook";
  reference?: string;
  status?: RenderStatus;
}) {
  const isRunbook = props.source === "Runbook";
  const icon = isRunbook ? "📕" : "📖";
  const heading = isRunbook ? "Internal runbook" : "Knowledge base";
  const sourceLabel = isRunbook ? "Internal runbook" : "DeepWiki MCP";
  if (props.status === "inProgress" && !props.answer) {
    return (
      <div className="gcard">
        <div className="gcard__label">{icon} {heading}</div>
        {props.question && <p className="gcard__title">{props.question}</p>}
        <CardSkeleton />
      </div>
    );
  }
  return (
    <div className="gcard">
      <div className="gcard__label">{icon} {heading}</div>
      <p className="gcard__title">{props.question}</p>
      <p className="gcard__text">{props.answer}</p>
      <div className="gcard__src">
        Source: {sourceLabel}
        {props.reference && <code>{props.reference}</code>}
      </div>
    </div>
  );
}

/** Cross-ticket pattern card: tickets the agent correlated + the connection note. */
export function RelatedTicketsCard(props: {
  connection: string;
  ticketIds?: string[];
  rows?: Array<{ ticketId: string; subject?: string; note?: string }>;
  status?: RenderStatus;
}) {
  if (props.status === "inProgress" && !props.connection) {
    return (
      <div className="gcard">
        <div className="gcard__label">🔗 Related tickets</div>
        <CardSkeleton />
      </div>
    );
  }
  const rows: Array<{ ticketId: string; subject?: string; note?: string }> =
    props.rows ?? (props.ticketIds ?? []).map((ticketId) => ({ ticketId }));
  return (
    <div className="gcard">
      <div className="gcard__label">🔗 Related tickets · {rows.length}</div>
      <p className="gcard__text">{props.connection}</p>
      <div className="triage">
        {rows.map((r) => (
          <div key={r.ticketId} className="triage__row">
            <div className="triage__head">
              <code className="triage__ticket">{r.ticketId}</code>
              {r.subject && <span className="triage__company">{r.subject}</span>}
            </div>
            {r.note && <div className="triage__reason">{r.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Session recap card: an audit of the changes made with Aria this session. */
export function ActivityRecapCard(props: {
  items: Array<{ summary: string; ticketId?: string; kind?: string }>;
  status?: RenderStatus;
}) {
  if (props.status === "inProgress" && props.items.length === 0) {
    return (
      <div className="gcard">
        <div className="gcard__label">🧾 Session recap</div>
        <CardSkeleton />
      </div>
    );
  }
  return (
    <div className="gcard">
      <div className="gcard__label">
        🧾 Session recap · {props.items.length} change{props.items.length === 1 ? "" : "s"}
      </div>
      {props.items.length === 0 ? (
        <p className="gcard__text">No changes recorded this session yet.</p>
      ) : (
        <ul className="gcard__list">
          {props.items.map((it, i) => (
            <li key={i}>{it.summary}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact chip shown for the agent's backend tool calls (instead of raw JSON). */
export function ToolActivityChip(props: { name: string; status: "inProgress" | "executing" | "complete" }) {
  const labels: Record<string, string> = {
    list_tickets: "Searching tickets",
    get_ticket: "Reading the ticket",
    list_customers: "Looking up customers",
    list_agents: "Reviewing the team roster",
    list_activity: "Reviewing the session log",
    ask_question: "Searching the knowledge base",
    read_wiki_structure: "Browsing the knowledge base",
    read_wiki_contents: "Reading the knowledge base",
    search_runbooks: "Searching internal runbooks",
    read_runbook: "Reading a runbook",
  };
  const isMcp = /wiki|ask_question|runbook/.test(props.name);
  const label = labels[props.name] ?? props.name;
  const done = props.status === "complete";
  return (
    <div className="toolchip">
      <span className="toolchip__icon">{isMcp ? "📖" : "🔧"}</span>
      <span className="toolchip__label">{label}</span>
      <span className={`toolchip__state ${done ? "toolchip__state--done" : ""}`}>{done ? "✓" : "…"}</span>
    </div>
  );
}

/** Human-in-the-loop approval card for a ticket the agent proposes creating. */
export function TicketCreateApprovalCard(props: {
  subject: string;
  body: string;
  priority: TicketPriority;
  customerName: string;
  resolvedCompany: string | null;
  status: "executing" | "complete" | "inProgress";
  onApprove: () => void;
  onCancel: () => void;
  outcome?: "created" | "cancelled" | null;
  createdId?: string | null;
}) {
  const decided = props.outcome != null || props.status === "complete";
  const resolved = props.resolvedCompany != null;
  return (
    <div className="gcard approve">
      <div className="gcard__label">＋ New ticket</div>
      <p className="gcard__title">{props.subject || "Untitled ticket"}</p>
      <div className="approve__draft">{props.body}</div>
      <div className="gcard__row">
        <PriorityPill priority={props.priority} />
        <span style={{ fontSize: 12, color: "var(--slate-500)" }}>
          ·{" "}
          {resolved ? (
            <>Customer: <b>{props.resolvedCompany}</b></>
          ) : (
            <span style={{ color: "var(--red)" }}>No customer matches “{props.customerName}”</span>
          )}
        </span>
      </div>
      {!decided ? (
        <div className="approve__actions">
          <button className="btn" onClick={props.onApprove} disabled={!resolved}>
            Approve &amp; create
          </button>
          <button className="btn btn--danger" onClick={props.onCancel}>Discard</button>
        </div>
      ) : (
        <div
          className={`approve__status ${props.outcome === "created" ? "approve__status--sent" : "approve__status--cancelled"}`}
        >
          {props.outcome === "created" ? `✓ Created ${props.createdId ?? "ticket"}` : "Discarded"}
        </div>
      )}
    </div>
  );
}

/** Read-only ranked triage board the agent renders in-chat (generative UI). */
export function TriageBoardCard(props: {
  rows: Array<{
    ticketId: string;
    company?: string;
    slaRisk?: SlaLevel;
    priority?: TicketPriority;
    proposedAction?: string;
    reason?: string;
  }>;
  status?: RenderStatus;
}) {
  if (props.status === "inProgress" && props.rows.length === 0) {
    return (
      <div className="gcard">
        <div className="gcard__label">⚡ Triage board</div>
        <CardSkeleton />
      </div>
    );
  }
  const rank: Record<SlaLevel, number> = { breach: 0, warning: 1, ok: 2 };
  const rows = [...props.rows].sort(
    (a, b) => (rank[a.slaRisk ?? "ok"] ?? 2) - (rank[b.slaRisk ?? "ok"] ?? 2),
  );
  return (
    <div className="gcard">
      <div className="gcard__label">⚡ Triage board · {rows.length} tickets</div>
      <div className="triage">
        {rows.map((r) => (
          <div key={r.ticketId} className="triage__row">
            <div className="triage__head">
              <code className="triage__ticket">{r.ticketId}</code>
              {r.company && <span className="triage__company">{r.company}</span>}
              {r.slaRisk && <SlaRiskPill level={r.slaRisk} />}
              {r.priority && <PriorityPill priority={r.priority} />}
            </div>
            {r.proposedAction && <div className="triage__verb">→ {r.proposedAction}</div>}
            {r.reason && <div className="triage__reason">{r.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Human-in-the-loop batch approval: the agent proposes N ticket changes and the
 * rep approves all / per-row / discards. Approving a row applies its write
 * immediately (matching setTicketStatus' persist-on-click behavior); the tool
 * call resolves once, when the rep finalizes.
 */
export function BatchTriageApprovalCard(props: {
  rationale: string;
  actions: BatchActionRow[];
  decisions: Record<string, RowDecision>;
  status: RenderStatus;
  terminal: boolean;
  summary: string | null;
  onApproveRow: (id: string) => void;
  onSkipRow: (id: string) => void;
  onApproveAll: () => void;
  onFinish: () => void;
  onDiscardAll: () => void;
}) {
  if (props.status === "inProgress" && props.actions.length === 0) {
    return (
      <div className="gcard approve">
        <div className="gcard__label">⚡ Triage plan</div>
        <CardSkeleton />
      </div>
    );
  }
  // Don't let the rep act on a half-streamed plan.
  const locked = props.status === "inProgress" || props.terminal;
  return (
    <div className="gcard approve">
      <div className="gcard__label">⚡ Triage plan · {props.actions.length} actions</div>
      {props.rationale && <p className="gcard__text">{props.rationale}</p>}
      <div className="triage">
        {props.actions.map((a) => {
          const d = props.decisions[a.id] ?? "pending";
          const { verb, value } = describeAction(a);
          return (
            <div key={a.id} className={`triage__row triage__row--${d}`}>
              <div className="triage__head">
                <code className="triage__ticket">{a.ticketId}</code>
                <span className="triage__verb">{verb}</span>
                {value}
              </div>
              {a.reason && <div className="triage__reason">{a.reason}</div>}
              {d === "pending" && !props.terminal ? (
                <div className="triage__actions">
                  <button className="btn btn--sm" disabled={locked} onClick={() => props.onApproveRow(a.id)}>
                    Approve
                  </button>
                  <button className="btn btn--sm btn--ghost" disabled={locked} onClick={() => props.onSkipRow(a.id)}>
                    Skip
                  </button>
                </div>
              ) : (
                <div className={`triage__badge triage__badge--${d}`}>
                  {d === "approved" ? "✓ Applied" : d === "skipped" ? "— Skipped" : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!props.terminal ? (
        <div className="approve__actions">
          <button className="btn" disabled={locked} onClick={props.onApproveAll}>
            Approve all
          </button>
          <button className="btn btn--ghost" disabled={locked} onClick={props.onFinish}>
            Finish
          </button>
          <button className="btn btn--danger" disabled={locked} onClick={props.onDiscardAll}>
            Discard all
          </button>
        </div>
      ) : (
        <div className="approve__status approve__status--sent">{props.summary ?? "Done."}</div>
      )}
    </div>
  );
}

/** Human-in-the-loop reply approval card (rendered via renderAndWaitForResponse). */
export function ReplyApprovalCard(props: {
  ticketId: string;
  message: string;
  status: "executing" | "complete" | "inProgress";
  onApprove: () => void;
  onCancel: () => void;
  outcome?: "sent" | "cancelled" | null;
}) {
  const decided = props.outcome != null || props.status === "complete";
  return (
    <div className="gcard approve">
      <div className="gcard__label">✎ Draft reply · {props.ticketId}</div>
      <div className="approve__draft">{props.message}</div>
      {!decided ? (
        <div className="approve__actions">
          <button className="btn" onClick={props.onApprove}>Approve &amp; send</button>
          <button className="btn btn--danger" onClick={props.onCancel}>Discard</button>
        </div>
      ) : (
        <div
          className={`approve__status ${props.outcome === "sent" ? "approve__status--sent" : "approve__status--cancelled"}`}
        >
          {props.outcome === "sent" ? "✓ Reply sent to the customer" : "Draft discarded"}
        </div>
      )}
    </div>
  );
}
