import type { TicketPriority } from "@agentdemo/shared";
import { PriorityPill } from "./pills.js";

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
