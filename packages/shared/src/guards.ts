import {
  CUSTOMER_PLANS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  USER_ROLES,
  type CustomerPlan,
  type TicketPriority,
  type TicketStatus,
  type UserRole,
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

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * True if `role` meets or exceeds `min` in the readonly < manager < admin order.
 * The single source of truth for every authorization check (server + subagents).
 */
export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  return USER_ROLES.indexOf(role) >= USER_ROLES.indexOf(min);
}
