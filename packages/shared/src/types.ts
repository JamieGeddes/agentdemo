/**
 * Shared domain model for the B2B support/ticketing app.
 * Used by the Fastify server, the LangGraph agent, and the React web app
 * so all three speak the same shapes.
 */

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const CUSTOMER_PLANS = ["free", "pro", "enterprise"] as const;
export type CustomerPlan = (typeof CUSTOMER_PLANS)[number];

/** A single message in a ticket's conversation thread. */
export interface Message {
  id: string;
  author: "customer" | "agent";
  /** Display name of who wrote it (customer contact or support rep). */
  authorName: string;
  body: string;
  createdAt: string; // ISO 8601
}

/** A support ticket. */
export interface Ticket {
  id: string;
  subject: string;
  /** The opening description from the customer. */
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string;
  /** Support rep currently assigned, or null if unassigned. */
  assigneeId: string | null;
  tags: string[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  messages: Message[];
}

/** A B2B customer (the company that filed tickets). */
export interface Customer {
  id: string;
  company: string;
  contactName: string;
  email: string;
  plan: CustomerPlan;
  /** Contracted response-time tier, e.g. "24h" / "8h" / "1h". */
  slaTier: string;
}

/**
 * One step in the agent's live "what I'm doing now" progress log, streamed
 * from the agent's state to the chat sidebar as it works. Shared so the agent
 * (which writes it) and the web app (which renders it) agree on the shape.
 */
export interface AriaStep {
  /** Deterministic id (derived from a tool-call id or step index) so a paused/resumed run never duplicates a step. */
  id: string;
  /** Human-readable label, e.g. "Reading the ticket". */
  label: string;
  status: "running" | "done";
  /** Optional extra context, e.g. the ticket id being read. */
  detail?: string;
}

/** A support rep who handles tickets. */
export interface Agent {
  id: string;
  name: string;
  /** Short initials used for the avatar chip. */
  avatar: string;
}

/** Fields a client (or the AI agent) may patch on a ticket. */
export interface TicketPatch {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string | null;
  tags?: string[];
}

/** Fields a client (or the AI agent) may patch on a customer. */
export interface CustomerPatch {
  plan?: CustomerPlan;
}

/** Fields needed to create a new ticket; the rest (id/timestamps/messages) are generated. */
export interface TicketCreateInput {
  subject: string;
  body: string;
  customerId: string;
  priority?: TicketPriority; // default "normal"
  status?: TicketStatus; // default "open"
  assigneeId?: string | null; // default null
  tags?: string[]; // default []
}

/** Query filters for listing tickets. */
export interface TicketListQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  customerId?: string;
  /** Free-text search across subject/body. */
  search?: string;
  sort?: "newest" | "oldest" | "priority";
}
