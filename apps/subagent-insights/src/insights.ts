import {
  roleAtLeast,
  slaRisk,
  type Agent,
  type Customer,
  type Ticket,
  type UserRole,
} from "@agentdemo/shared";

/**
 * The reporting math, kept as pure functions so the authorization tiers are
 * trivially testable without an LLM or a network. Each function takes the
 * caller's `role` and returns a LESS detailed result for `readonly` than for
 * `manager`/`admin` — readonly never sees customer PII or the CSV export. This
 * is the deterministic enforcement point (the LLM only chooses which to call).
 */

const ACTIVE: ReadonlySet<Ticket["status"]> = new Set(["open", "pending"]);

export function slaRiskReport(
  tickets: Ticket[],
  customers: Customer[],
  role: UserRole,
  now: number = Date.now(),
) {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const rows = tickets
    .filter((t) => ACTIVE.has(t.status))
    .map((t) => {
      const c = byId.get(t.customerId);
      const risk = slaRisk(t, c?.slaTier ?? "24h", now);
      return {
        ticketId: t.id,
        level: risk.level,
        percentUsed: Math.round(risk.fractionUsed * 100),
        company: c?.company ?? "(unknown)",
        contactName: c?.contactName ?? "",
        contactEmail: c?.email ?? "",
        slaTier: c?.slaTier ?? "24h",
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);

  const counts = { breach: 0, warning: 0, ok: 0 } as Record<string, number>;
  for (const r of rows) counts[r.level]++;

  if (!roleAtLeast(role, "manager")) {
    return {
      scope: "summary" as const,
      counts,
      breaching: rows.filter((r) => r.level === "breach").map((r) => r.ticketId),
      note: "Sign in as manager or admin for the full ranked report (customer details + CSV export).",
    };
  }

  const ranked = rows.map(({ contactName, contactEmail, ...rest }) => ({
    ...rest,
    contact: contactName,
    email: contactEmail,
  }));
  const csvExport = [
    "ticketId,level,percentUsed,company,contact,email,slaTier",
    ...ranked.map((r) => `${r.ticketId},${r.level},${r.percentUsed},${r.company},${r.contact},${r.email},${r.slaTier}`),
  ].join("\n");

  return { scope: "full" as const, counts, ranked, csvExport };
}

export function teamPerformance(tickets: Ticket[], agents: Agent[], role: UserRole) {
  const active = tickets.filter((t) => ACTIVE.has(t.status));
  const totalOpen = active.length;
  const unassigned = active.filter((t) => !t.assigneeId).length;

  if (!roleAtLeast(role, "manager")) {
    return {
      scope: "summary" as const,
      totalOpen,
      unassigned,
      reps: agents.length,
      avgOpenPerRep: Number((totalOpen / Math.max(1, agents.length)).toFixed(1)),
      note: "Per-rep breakdown (names + load) requires manager or admin.",
    };
  }

  const perRep = agents
    .map((a) => ({ id: a.id, name: a.name, openAssigned: active.filter((t) => t.assigneeId === a.id).length }))
    .sort((a, b) => b.openAssigned - a.openAssigned);

  return { scope: "full" as const, totalOpen, unassigned, perRep };
}

export function customerHealth(
  customer: Customer,
  tickets: Ticket[],
  role: UserRole,
  now: number = Date.now(),
) {
  const theirs = tickets.filter((t) => t.customerId === customer.id);
  const open = theirs.filter((t) => ACTIVE.has(t.status));
  const atRisk = open.filter((t) => slaRisk(t, customer.slaTier, now).level !== "ok").length;

  const base = {
    company: customer.company,
    plan: customer.plan,
    slaTier: customer.slaTier,
    seats: customer.seats,
    openTickets: open.length,
    atRisk,
  };

  if (!roleAtLeast(role, "manager")) {
    return { scope: "summary" as const, ...base, note: "Contact details require manager or admin." };
  }

  return { scope: "full" as const, ...base, contactName: customer.contactName, contactEmail: customer.email };
}
