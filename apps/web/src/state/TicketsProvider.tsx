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
import type {
  Agent,
  Customer,
  Ticket,
  TicketCreateInput,
  TicketListQuery,
  TicketPatch,
} from "@agentdemo/shared";
import { api } from "../api.js";

interface TicketsContextValue {
  tickets: Ticket[];
  customers: Customer[];
  agents: Agent[];
  filters: TicketListQuery;
  selectedId: string | null;
  selected: Ticket | null;
  loading: boolean;
  setFilters: (next: TicketListQuery) => void;
  selectTicket: (id: string | null) => void;
  patchTicket: (id: string, patch: TicketPatch) => Promise<void>;
  addTicket: (input: TicketCreateInput) => Promise<Ticket>;
  sendMessage: (id: string, body: string) => Promise<void>;
  customerOf: (t: Ticket) => Customer | undefined;
  /** Resolve a customer by company name (exact, then fuzzy). Stable + reads live data. */
  findCustomerByName: (name: string) => Customer | undefined;
  agentOf: (id: string | null) => Agent | undefined;
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

  // Mirror customers into a ref so stable callbacks (e.g. the agent's createTicket
  // render closure, captured once by CopilotKit) can read the latest list.
  const customersRef = useRef<Customer[]>([]);
  customersRef.current = customers;

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

  const patchTicket = useCallback(
    async (id: string, patch: TicketPatch) => {
      const updated = await api.patchTicket(id, patch);
      setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    },
    [],
  );

  const addTicket = useCallback(async (input: TicketCreateInput) => {
    const created = await api.createTicket(input);
    setTickets((prev) => [created, ...prev]); // show it immediately
    setSelectedId(created.id); // and open it
    // New tickets are "open"; if a non-matching status filter is active, clear it
    // so the rep actually sees the ticket they just created.
    setFilters((f) => (f.status && f.status !== created.status ? { ...f, status: undefined } : f));
    return created;
  }, []);

  const sendMessage = useCallback(async (id: string, body: string) => {
    const updated = await api.addMessage(id, body);
    setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

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
  const agentOf = useCallback(
    (id: string | null) => (id ? agents.find((a) => a.id === id) : undefined),
    [agents],
  );

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  const value: TicketsContextValue = {
    tickets,
    customers,
    agents,
    filters,
    selectedId,
    selected,
    loading,
    setFilters,
    selectTicket,
    patchTicket,
    addTicket,
    sendMessage,
    customerOf,
    findCustomerByName,
    agentOf,
    refresh,
  };

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>;
}

export function useTickets(): TicketsContextValue {
  const ctx = useContext(TicketsContext);
  if (!ctx) throw new Error("useTickets must be used within TicketsProvider");
  return ctx;
}
