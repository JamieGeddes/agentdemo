import type { CustomerPlan, TicketPriority } from "@agentdemo/shared";
import { PlanBadge, PriorityPill } from "./pills.js";

/** Rich ticket summary card the agent renders in-chat (generative UI). */
export function TicketSummaryCard(props: {
  ticketId: string;
  summary: string;
  highlights?: string[];
  suggestedPriority?: TicketPriority;
  sentiment?: string;
}) {
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
}) {
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

/** Knowledge-base answer card with a source citation (from the DeepWiki MCP server). */
export function KnowledgeCitationCard(props: { question: string; answer: string; repo?: string }) {
  return (
    <div className="gcard">
      <div className="gcard__label">📖 Knowledge base</div>
      <p className="gcard__title">{props.question}</p>
      <p className="gcard__text">{props.answer}</p>
      <div className="gcard__src">
        Source: DeepWiki MCP{props.repo && <code>{props.repo}</code>}
      </div>
    </div>
  );
}

/** Compact chip shown for the agent's backend tool calls (instead of raw JSON). */
export function ToolActivityChip(props: { name: string; status: "inProgress" | "executing" | "complete" }) {
  const labels: Record<string, string> = {
    list_tickets: "Searching tickets",
    get_ticket: "Reading the ticket",
    list_customers: "Looking up customers",
    ask_question: "Searching the knowledge base",
    read_wiki_structure: "Browsing the knowledge base",
    read_wiki_contents: "Reading the knowledge base",
  };
  const isMcp = /wiki|ask_question/.test(props.name);
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
