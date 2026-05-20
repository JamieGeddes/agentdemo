import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Agent,
  Customer,
  Ticket,
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
  sendMessage: (id: string, body: string) => Promise<void>;
  customerOf: (t: Ticket) => Customer | undefined;
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

  useEffect(() => {
    void api.listCustomers().then(setCustomers);
    void api.listAgents().then(setAgents);
  }, []);

  const selectTicket = useCallback((id: string | null) => setSelectedId(id), []);

  const patchTicket = useCallback(
    async (id: string, patch: TicketPatch) => {
      const updated = await api.patchTicket(id, patch);
      setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    },
    [],
  );

  const sendMessage = useCallback(async (id: string, body: string) => {
    const updated = await api.addMessage(id, body);
    setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const customerOf = useCallback(
    (t: Ticket) => customers.find((c) => c.id === t.customerId),
    [customers],
  );
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
    sendMessage,
    customerOf,
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
