import { useState } from "react";
import { TICKET_STATUSES, type TicketStatus } from "@agentdemo/shared";
import { useTickets } from "../state/TicketsProvider.js";
import { AssigneeChip, PriorityPill, StatusPill, relativeTime } from "./pills.js";
import { NewTicketModal } from "./NewTicketModal.js";

const STATUS_FILTERS: Array<{ label: string; value: TicketStatus | "all" }> = [
  { label: "All", value: "all" },
  ...TICKET_STATUSES.map((s) => ({ label: s[0].toUpperCase() + s.slice(1), value: s })),
];

export function TicketList({
  flashId,
  onFlash,
}: {
  flashId: string | null;
  onFlash: (id: string) => void;
}) {
  const { tickets, filters, setFilters, selectedId, selectTicket, customerOf, agentOf, loading } =
    useTickets();
  const [showNew, setShowNew] = useState(false);

  const active = filters.status ?? "all";
  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <section className="list">
      <div className="list__head">
        <div className="list__head-row">
          <h1 className="list__title">Inbox</h1>
          <button className="btn btn--sm" onClick={() => setShowNew(true)}>
            ＋ New ticket
          </button>
        </div>
        <div className="list__sub">
          {loading ? "Loading…" : `${tickets.length} tickets · ${openCount} open`}
        </div>
      </div>

      {showNew && (
        <NewTicketModal onClose={() => setShowNew(false)} onCreated={(id) => onFlash(id)} />
      )}

      <div className="filters">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`chip ${active === f.value ? "chip--active" : ""}`}
            onClick={() =>
              setFilters({ ...filters, status: f.value === "all" ? undefined : (f.value as TicketStatus) })
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="list__scroll">
        {tickets.length === 0 && !loading && <div className="empty-list">No tickets match this filter.</div>}
        {tickets.map((t) => {
          const customer = customerOf(t);
          return (
            <button
              key={t.id}
              className={`row ${selectedId === t.id ? "row--active" : ""} ${flashId === t.id ? "row--flash" : ""}`}
              onClick={() => selectTicket(t.id)}
            >
              <div className="row__top">
                <span className="row__id">{t.id}</span>
                <PriorityPill priority={t.priority} />
              </div>
              <div className="row__subject">{t.subject}</div>
              <div className="row__meta">
                <StatusPill status={t.status} />
                <span>·</span>
                <span>{customer?.company ?? "—"}</span>
                <span style={{ marginLeft: "auto" }}>{relativeTime(t.updatedAt)}</span>
              </div>
              <div className="row__meta" style={{ marginTop: 6 }}>
                <AssigneeChip agent={agentOf(t.assigneeId)} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
