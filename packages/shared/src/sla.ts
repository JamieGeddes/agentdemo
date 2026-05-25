import type { Ticket } from "./types.js";

/**
 * SLA-risk math, shared so the web watcher, the agent's triage reasoning, and
 * the tests all agree on what "breaching" means. Pure functions — pass an
 * explicit `now` for deterministic tests.
 */

export type SlaLevel = "ok" | "warning" | "breach";

export interface SlaRisk {
  level: SlaLevel;
  /** Milliseconds since the ticket was raised (0 for settled tickets). */
  elapsedMs: number;
  /** The SLA response budget for the customer's tier, in milliseconds. */
  budgetMs: number;
  /** elapsedMs / budgetMs — 1.0 means the budget is fully spent. */
  fractionUsed: number;
}

/** At/above this fraction of the budget a ticket is "warning" (amber). */
export const SLA_WARNING_FRACTION = 0.75;

/** Tickets in these statuses are still "on the clock"; the rest are settled. */
const ACTIVE_STATUSES: ReadonlySet<Ticket["status"]> = new Set(["open", "pending"]);

/**
 * Parse an SLA tier like "1h" / "8h" / "24h" into a millisecond budget.
 * Falls back to 24h for anything unparseable so a bad tier never throws.
 */
export function slaBudgetMs(slaTier: string): number {
  const match = /^\s*(\d+)\s*h\s*$/i.exec(slaTier);
  const hours = match ? Number(match[1]) : 24;
  return hours * 60 * 60 * 1000;
}

/**
 * Compute a ticket's SLA risk against its customer's response-time tier.
 * Settled tickets (resolved/closed) are always "ok". Risk is measured from
 * when the customer raised the ticket (createdAt), so touching a ticket can't
 * silently reset its clock.
 */
export function slaRisk(
  ticket: Pick<Ticket, "status" | "createdAt">,
  slaTier: string,
  now: number = Date.now(),
): SlaRisk {
  const budgetMs = slaBudgetMs(slaTier);

  if (!ACTIVE_STATUSES.has(ticket.status)) {
    return { level: "ok", elapsedMs: 0, budgetMs, fractionUsed: 0 };
  }

  const elapsedMs = Math.max(0, now - Date.parse(ticket.createdAt));
  const fractionUsed = budgetMs > 0 ? elapsedMs / budgetMs : 0;
  const level: SlaLevel =
    fractionUsed >= 1 ? "breach" : fractionUsed >= SLA_WARNING_FRACTION ? "warning" : "ok";

  return { level, elapsedMs, budgetMs, fractionUsed };
}
