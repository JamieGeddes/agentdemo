import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  priorityRank,
  slaRisk,
  type ActivityCreateInput,
  type Agent,
  type Customer,
  type CustomerPatch,
  type SlaRisk,
  type Ticket,
  type TicketCreateInput,
  type TicketListQuery,
  type TicketPatch,
} from "@agentdemo/shared";
import { api } from "../api.js";

/** Which top-level page the rep (or the agent) is currently on. */
export type View = "inbox" | "customers";

/** A ticket whose SLA response budget is at risk (warning) or spent (breach). */
export interface SlaAlert {
  ticket: Ticket;
  customer: Customer | undefined;
  risk: SlaRisk;
}

const SLA_LEVEL_RANK: Record<SlaRisk["level"], number> = { breach: 0, warning: 1, ok: 2 };

/** Stable per-page-load id so a session's activity can be recapped. */
function newSessionId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `sess-${Math.random().toString(36).slice(2, 10)}`;
}

interface TicketsContextValue {
  tickets: Ticket[];
  customers: Customer[];
  agents: Agent[];
  filters: TicketListQuery;
  selectedId: string | null;
  selected: Ticket | null;
  loading: boolean;
  view: View;
  selectedCustomerId: string | null;
  selectedCustomer: Customer | null;
  setView: (next: View) => void;
  selectCustomer: (id: string | null) => void;
  patchCustomer: (id: string, patch: CustomerPatch) => Promise<void>;
  setFilters: (next: TicketListQuery) => void;
  selectTicket: (id: string | null) => void;
  patchTicket: (id: string, patch: TicketPatch) => Promise<void>;
  addTicket: (input: TicketCreateInput) => Promise<Ticket>;
  sendMessage: (id: string, body: string) => Promise<void>;
  customerOf: (t: Ticket) => Customer | undefined;
  /** Resolve a customer by company name (exact, then fuzzy). Stable + reads live data. */
  findCustomerByName: (name: string) => Customer | undefined;
  agentOf: (id: string | null) => Agent | undefined;
  /** Tickets at SLA risk, worst first — drives the proactive watcher banner. */
  slaAlerts: SlaAlert[];
  /** This browser session's id, for scoping the activity recap. */
  sessionId: string;
  refresh: () => Promise<void>;
}

const TicketsContext = createContext<TicketsContextValue | null>(null);

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filters, setFilters] = useState<TicketListQuery>({ sort: "priority" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("inbox");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [sessionId] = useState(newSessionId);
  // A slow clock so SLA risk advances during a long demo without thrashing renders.
  const [now, setNow] = useState(() => Date.now());

  // Mirror customers/agents into refs so stable callbacks (e.g. the agent's
  // createTicket render closure or assignTicket handler, captured once by
  // CopilotKit) can read the latest list.
  const customersRef = useRef<Customer[]>([]);
  customersRef.current = customers;
  const agentsRef = useRef<Agent[]>([]);
  agentsRef.current = agents;

  // Fire-and-forget audit log of session writes (drives the "what did you do?"
  // recap). Never blocks or throws — a failed POST must not break a UI write.
  const logActivity = useCallback(
    (entry: Omit<ActivityCreateInput, "sessionId">) => {
      void api.logActivity({ ...entry, sessionId }).catch(() => {});
    },
    [sessionId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listTickets(filters);
      setTickets(list);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Reference data (customers/agents) for the pickers. Retry on failure: under
  // `npm run dev` all three servers boot concurrently, so the first load can
  // hit Fastify before it's ready — a single swallowed rejection would leave the
  // dropdowns empty (and ticket creation blocked) for the whole session.
  const loadRefData = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api.listCustomers(), api.listAgents()]);
      setCustomers(c);
      setAgents(a);
    } catch {
      setTimeout(() => void loadRefData(), 1000);
    }
  }, []);

  useEffect(() => {
    void loadRefData();
  }, [loadRefData]);

  const selectTicket = useCallback((id: string | null) => setSelectedId(id), []);
  const selectCustomer = useCallback((id: string | null) => setSelectedCustomerId(id), []);

  const patchCustomer = useCallback(
    async (id: string, patch: CustomerPatch) => {
      const updated = await api.patchCustomer(id, patch);
      setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
      if (patch.plan) logActivity({ kind: "plan", summary: `${updated.company} → ${patch.plan} plan` });
    },
    [logActivity],
  );

  const patchTicket = useCallback(
    async (id: string, patch: TicketPatch) => {
      const updated = await api.patchTicket(id, patch);
      setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));

      // Record what changed, for the session recap.
      const parts: string[] = [];
      let kind = "update";
      if (patch.status !== undefined) {
        parts.push(`status → ${patch.status}`);
        kind = "status";
      }
      if (patch.priority !== undefined) {
        parts.push(`priority → ${patch.priority}`);
        kind = "priority";
      }
      if (patch.assigneeId !== undefined) {
        const who = patch.assigneeId
          ? (agentsRef.current.find((a) => a.id === patch.assigneeId)?.name ?? patch.assigneeId)
          : "unassigned";
        parts.push(`assigned → ${who}`);
        kind = "assign";
      }
      if (parts.length) logActivity({ kind, ticketId: id, summary: `${id} ${parts.join(", ")}` });
    },
    [logActivity],
  );

  const addTicket = useCallback(
    async (input: TicketCreateInput) => {
      const created = await api.createTicket(input);
      setTickets((prev) => [created, ...prev]); // show it immediately
      setSelectedId(created.id); // and open it
      // New tickets are "open"; if a non-matching status filter is active, clear it
      // so the rep actually sees the ticket they just created.
      setFilters((f) => (f.status && f.status !== created.status ? { ...f, status: undefined } : f));
      logActivity({ kind: "create", ticketId: created.id, summary: `Created ${created.id}: ${created.subject}` });
      return created;
    },
    [logActivity],
  );

  const sendMessage = useCallback(
    async (id: string, body: string) => {
      const updated = await api.addMessage(id, body);
      setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
      logActivity({ kind: "reply", ticketId: id, summary: `Replied to ${id}` });
    },
    [logActivity],
  );

  const customerOf = useCallback(
    (t: Ticket) => customers.find((c) => c.id === t.customerId),
    [customers],
  );
  const findCustomerByName = useCallback((name: string) => {
    const q = name.trim().toLowerCase();
    if (!q) return undefined;
    const list = customersRef.current;
    return (
      list.find((c) => c.company.toLowerCase() === q) ??
      list.find(
        (c) => c.company.toLowerCase().includes(q) || q.includes(c.company.toLowerCase()),
      )
    );
  }, []);
  // Ref-based so it's stable: CopilotKit captures the assignTicket handler once,
  // and it must resolve names against the live roster (not the mount-time empty one).
  const agentOf = useCallback(
    (id: string | null) => (id ? agentsRef.current.find((a) => a.id === id) : undefined),
    [],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Proactive SLA watch: which open/pending tickets are at risk, worst first.
  // Computed from the current ticket list (the default unfiltered view covers
  // the whole queue) so the banner reflects what actually needs attention.
  const slaAlerts = useMemo<SlaAlert[]>(() => {
    return tickets
      .map((ticket) => {
        const customer = customers.find((c) => c.id === ticket.customerId);
        return { ticket, customer, risk: slaRisk(ticket, customer?.slaTier ?? "24h", now) };
      })
      .filter((a) => a.risk.level !== "ok")
      .sort((a, b) => {
        const byLevel = SLA_LEVEL_RANK[a.risk.level] - SLA_LEVEL_RANK[b.risk.level];
        return byLevel !== 0 ? byLevel : priorityRank(b.ticket.priority) - priorityRank(a.ticket.priority);
      });
  }, [tickets, customers, now]);

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const value: TicketsContextValue = {
    tickets,
    customers,
    agents,
    filters,
    selectedId,
    selected,
    loading,
    view,
    selectedCustomerId,
    selectedCustomer,
    setView,
    selectCustomer,
    patchCustomer,
    setFilters,
    selectTicket,
    patchTicket,
    addTicket,
    sendMessage,
    customerOf,
    findCustomerByName,
    agentOf,
    slaAlerts,
    sessionId,
    refresh,
  };

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>;
}

export function useTickets(): TicketsContextValue {
  const ctx = useContext(TicketsContext);
  if (!ctx) throw new Error("useTickets must be used within TicketsProvider");
  return ctx;
}
