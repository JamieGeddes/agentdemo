import { useEffect, useMemo, useState } from "react";
import type { Ticket } from "@agentdemo/shared";
import { useTickets } from "../state/TicketsProvider.js";
import { api } from "../api.js";
import { PriorityPill, PlanBadge, StatusPill, relativeTime } from "./pills.js";

/**
 * The Customers page — directory (left) + customer detail (right). Mirrors the
 * inbox layout (`TicketList` / `TicketDetail`) and shares the same `.app` grid
 * columns. Ticket counts/threads are fetched once here and grouped by customer,
 * independent of the inbox filters.
 */
export function CustomersPage() {
  const { customers, selectedCustomerId, selectCustomer } = useTickets();
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    void api.listTickets({}).then(setAllTickets);
  }, []);

  const ticketsByCustomer = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of allTickets) {
      const list = map.get(t.customerId) ?? [];
      list.push(t);
      map.set(t.customerId, list);
    }
    return map;
  }, [allTickets]);

  return (
    <>
      <section className="list">
        <div className="list__head">
          <div className="list__head-row">
            <h1 className="list__title">Customers</h1>
          </div>
          <div className="list__sub">{customers.length} accounts</div>
        </div>

        <div className="list__scroll">
          {customers.map((c) => {
            const tickets = ticketsByCustomer.get(c.id) ?? [];
            const open = tickets.filter((t) => t.status === "open").length;
            return (
              <button
                key={c.id}
                className={`row ${selectedCustomerId === c.id ? "row--active" : ""}`}
                onClick={() => selectCustomer(c.id)}
              >
                <div className="row__top">
                  <span className="row__id">{c.company}</span>
                  <PlanBadge plan={c.plan} />
                </div>
                <div className="row__meta">
                  <span>{c.contactName}</span>
                  <span style={{ marginLeft: "auto" }}>
                    {tickets.length} tickets · {open} open
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <CustomerDetail tickets={selectedCustomerId ? ticketsByCustomer.get(selectedCustomerId) ?? [] : []} />
    </>
  );
}

function CustomerDetail({ tickets }: { tickets: Ticket[] }) {
  const { selectedCustomer, setView, selectTicket } = useTickets();

  if (!selectedCustomer) {
    return (
      <section className="detail detail--empty">
        <div className="detail__empty-card">
          <h2>Select a customer</h2>
          <p>Pick an account from the directory — or ask Aria to open one for you.</p>
        </div>
      </section>
    );
  }

  const c = selectedCustomer;
  const open = tickets.filter((t) => t.status === "open").length;

  const openTicket = (id: string) => {
    selectTicket(id);
    setView("inbox");
  };

  return (
    <section className="detail">
      <header className="detail__head">
        <span className="detail__id">{c.id}</span>
        <h2 className="detail__subject">{c.company}</h2>
      </header>

      <div className="detail__body">
        <div>
          <div className="list__sub" style={{ marginBottom: 10 }}>
            {tickets.length} tickets · {open} open
          </div>
          <div className="thread">
            {tickets.length === 0 && <div className="empty-list">No tickets for this customer.</div>}
            {tickets.map((t) => (
              <button key={t.id} className="row" onClick={() => openTicket(t.id)}>
                <div className="row__top">
                  <span className="row__id">{t.id}</span>
                  <PriorityPill priority={t.priority} />
                </div>
                <div className="row__subject">{t.subject}</div>
                <div className="row__meta">
                  <StatusPill status={t.status} />
                  <span style={{ marginLeft: "auto" }}>{relativeTime(t.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="panel">
          <p className="panel__title">Account</p>
          <div className="panel__company">{c.company}</div>
          <div style={{ marginTop: 4, marginBottom: 10 }}>
            <PlanBadge plan={c.plan} />
          </div>
          <div className="panel__row"><span>Contact</span><span>{c.contactName}</span></div>
          <div className="panel__row"><span>Email</span><span style={{ fontSize: 12 }}>{c.email}</span></div>
          <div className="panel__row"><span>SLA</span><span>{c.slaTier} response</span></div>
          <div className="panel__row"><span>Open tickets</span><span>{open}</span></div>
        </aside>
      </div>
    </section>
  );
}
