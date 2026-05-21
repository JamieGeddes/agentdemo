import {
  CUSTOMER_PLANS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type CustomerPlan,
  type TicketPriority,
  type TicketStatus,
} from "./types.js";

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === "string" && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function isCustomerPlan(value: unknown): value is CustomerPlan {
  return typeof value === "string" && (CUSTOMER_PLANS as readonly string[]).includes(value);
}

/** Higher number = more urgent. Used for sorting and SLA emphasis. */
export function priorityRank(priority: TicketPriority): number {
  return TICKET_PRIORITIES.indexOf(priority);
}
