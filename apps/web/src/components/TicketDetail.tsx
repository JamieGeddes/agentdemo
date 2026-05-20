import { useState } from "react";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
} from "@agentdemo/shared";
import { useTickets } from "../state/TicketsProvider.js";
import { AssigneeChip, PlanBadge, relativeTime } from "./pills.js";

export function TicketDetail() {
  const { selected, patchTicket, sendMessage, customerOf, agentOf, agents } = useTickets();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  if (!selected) {
    return (
      <section className="detail detail--empty">
        <div className="detail__empty-card">
          <h2>Select a ticket</h2>
          <p>Pick a conversation from the inbox — or ask Aria, your copilot, to open one for you.</p>
        </div>
      </section>
    );
  }

  const ticket: Ticket = selected;
  const customer = customerOf(ticket);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await sendMessage(ticket.id, draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="detail">
      <header className="detail__head">
        <span className="detail__id">{ticket.id}</span>
        <h2 className="detail__subject">{ticket.subject}</h2>
        <div className="detail__controls">
          <div className="field">
            <span className="field__label">Status</span>
            <select
              className="select"
              value={ticket.status}
              onChange={(e) => void patchTicket(ticket.id, { status: e.target.value as TicketStatus })}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Priority</span>
            <select
              className="select"
              value={ticket.priority}
              onChange={(e) => void patchTicket(ticket.id, { priority: e.target.value as TicketPriority })}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Assignee</span>
            <select
              className="select"
              value={ticket.assigneeId ?? ""}
              onChange={(e) => void patchTicket(ticket.id, { assigneeId: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="detail__body">
        <div>
          <div className="thread">
            {ticket.messages.map((m) => (
              <div key={m.id} className={`bubble bubble--${m.author}`}>
                <div className="bubble__head">
                  <span className="bubble__author">{m.authorName}</span>
                  <span className="bubble__time">{relativeTime(m.createdAt)}</span>
                </div>
                <div className="bubble__body">{m.body}</div>
              </div>
            ))}
          </div>

          <div className="composer">
            <textarea
              placeholder="Write a reply… or ask Aria to draft one for you."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="composer__bar">
              <span className="composer__hint">Replies are added to the customer thread.</span>
              <button className="btn" onClick={() => void send()} disabled={sending || !draft.trim()}>
                {sending ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>
        </div>

        <aside className="panel">
          <p className="panel__title">Customer</p>
          <div className="panel__company">{customer?.company ?? "Unknown"}</div>
          <div style={{ marginTop: 4, marginBottom: 10 }}>
            {customer && <PlanBadge plan={customer.plan} />}
          </div>
          <div className="panel__row"><span>Contact</span><span>{customer?.contactName ?? "—"}</span></div>
          <div className="panel__row"><span>Email</span><span style={{ fontSize: 12 }}>{customer?.email ?? "—"}</span></div>
          <div className="panel__row"><span>SLA</span><span>{customer?.slaTier ?? "—"} response</span></div>
          <div className="panel__row"><span>Assignee</span><AssigneeChip agent={agentOf(ticket.assigneeId)} /></div>
          <div className="panel__row"><span>Opened</span><span>{relativeTime(ticket.createdAt)}</span></div>
          <div className="panel__row"><span>Tags</span><span>{ticket.tags.join(", ") || "—"}</span></div>
        </aside>
      </div>
    </section>
  );
}
