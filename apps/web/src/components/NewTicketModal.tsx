import { useEffect, useState } from "react";
import { TICKET_PRIORITIES, type TicketPriority } from "@agentdemo/shared";
import { useTickets } from "../state/TicketsProvider.js";

/** Modal form for a rep to file a new ticket by hand. */
export function NewTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { customers, agents, addTicket } = useTickets();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [customerId, setCustomerId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Customers load asynchronously; auto-select the first one once the list is
  // available (or if the current selection isn't in it). Without this, opening
  // the modal before customers arrive leaves the dropdown blank and Create
  // permanently disabled.
  useEffect(() => {
    if (customers.length && !customers.some((c) => c.id === customerId)) {
      setCustomerId(customers[0].id);
    }
  }, [customers, customerId]);

  const canSubmit = subject.trim() && body.trim() && customerId && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await addTicket({
        subject: subject.trim(),
        body: body.trim(),
        priority,
        customerId,
        assigneeId: assigneeId || null,
      });
      onClose();
      onCreated(created.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal__overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <h2 className="modal__title">New ticket</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="modal__field">
          <span className="modal__label">Subject</span>
          <input
            className="modal__input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary of the issue"
            autoFocus
          />
        </label>

        <label className="modal__field">
          <span className="modal__label">Description</span>
          <textarea
            className="modal__input modal__textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What is the customer reporting?"
          />
        </label>

        <div className="modal__grid">
          <label className="modal__field">
            <span className="modal__label">Customer</span>
            <select
              className="select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={!customers.length}
            >
              {customers.length === 0 ? (
                <option value="">Loading customers…</option>
              ) : (
                customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="modal__field">
            <span className="modal__label">Priority</span>
            <select
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="modal__field">
            <span className="modal__label">Assignee</span>
            <select className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
