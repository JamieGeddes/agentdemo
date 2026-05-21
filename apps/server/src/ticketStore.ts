import { randomUUID } from "node:crypto";
import {
  priorityRank,
  type Agent,
  type Customer,
  type CustomerPatch,
  type Message,
  type Ticket,
  type TicketCreateInput,
  type TicketListQuery,
  type TicketPatch,
} from "@agentdemo/shared";
import type { DB } from "./db.js";

interface TicketRow {
  id: string;
  subject: string;
  body: string;
  status: Ticket["status"];
  priority: Ticket["priority"];
  customerId: string;
  assigneeId: string | null;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

/** Data-access layer for tickets/customers/agents, backed by SQLite. */
export class TicketStore {
  constructor(private readonly db: DB) {}

  list(query: TicketListQuery = {}): Ticket[] {
    const rows = this.db.prepare("SELECT * FROM tickets").all() as TicketRow[];
    let tickets = rows.map((r) => this.hydrate(r));

    if (query.status) tickets = tickets.filter((t) => t.status === query.status);
    if (query.priority) tickets = tickets.filter((t) => t.priority === query.priority);
    if (query.assigneeId) tickets = tickets.filter((t) => t.assigneeId === query.assigneeId);
    if (query.customerId) tickets = tickets.filter((t) => t.customerId === query.customerId);
    if (query.search) {
      const q = query.search.toLowerCase();
      tickets = tickets.filter(
        (t) => t.subject.toLowerCase().includes(q) || t.body.toLowerCase().includes(q),
      );
    }

    const sort = query.sort ?? "newest";
    tickets.sort((a, b) => {
      if (sort === "priority") return priorityRank(b.priority) - priorityRank(a.priority);
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sort === "oldest" ? cmp : -cmp;
    });

    return tickets;
  }

  get(id: string): Ticket | null {
    const row = this.db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  create(input: TicketCreateInput): Ticket {
    const id = this.nextTicketId();
    const now = new Date().toISOString();
    const ticket = {
      id,
      subject: input.subject,
      body: input.body,
      status: input.status ?? "open",
      priority: input.priority ?? "normal",
      customerId: input.customerId,
      assigneeId: input.assigneeId ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        "INSERT INTO tickets (id, subject, body, status, priority, customerId, assigneeId, tags, createdAt, updatedAt) VALUES (@id, @subject, @body, @status, @priority, @customerId, @assigneeId, @tags, @createdAt, @updatedAt)",
      )
      .run({ ...ticket, tags: JSON.stringify(ticket.tags) });

    return this.get(id)!;
  }

  /** Next sequential id following the seed convention (T-1001, T-1002, …). */
  private nextTicketId(): string {
    const rows = this.db.prepare("SELECT id FROM tickets").all() as Array<{ id: string }>;
    const max = rows.reduce((acc, { id }) => {
      const m = id.match(/^T-(\d+)$/);
      return m ? Math.max(acc, Number(m[1])) : acc;
    }, 1000);
    return `T-${max + 1}`;
  }

  update(id: string, patch: TicketPatch): Ticket | null {
    const existing = this.get(id);
    if (!existing) return null;

    const next = {
      status: patch.status ?? existing.status,
      priority: patch.priority ?? existing.priority,
      assigneeId: patch.assigneeId === undefined ? existing.assigneeId : patch.assigneeId,
      tags: patch.tags ?? existing.tags,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        "UPDATE tickets SET status=@status, priority=@priority, assigneeId=@assigneeId, tags=@tags, updatedAt=@updatedAt WHERE id=@id",
      )
      .run({ ...next, tags: JSON.stringify(next.tags), id });

    return this.get(id);
  }

  addMessage(id: string, input: Pick<Message, "author" | "authorName" | "body">): Ticket | null {
    const existing = this.get(id);
    if (!existing) return null;

    const message: Message = {
      id: `m-${randomUUID().slice(0, 8)}`,
      author: input.author,
      authorName: input.authorName,
      body: input.body,
      createdAt: new Date().toISOString(),
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO messages (id, ticketId, author, authorName, body, createdAt) VALUES (@id, @ticketId, @author, @authorName, @body, @createdAt)",
        )
        .run({ ...message, ticketId: id });
      this.db.prepare("UPDATE tickets SET updatedAt=? WHERE id=?").run(message.createdAt, id);
    });
    tx();

    return this.get(id);
  }

  listCustomers(): Customer[] {
    return this.db.prepare("SELECT * FROM customers").all() as Customer[];
  }

  getCustomer(id: string): Customer | null {
    const row = this.db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as
      | Customer
      | undefined;
    return row ?? null;
  }

  updateCustomer(id: string, patch: CustomerPatch): Customer | null {
    const existing = this.getCustomer(id);
    if (!existing) return null;

    const plan = patch.plan ?? existing.plan;
    this.db.prepare("UPDATE customers SET plan=? WHERE id=?").run(plan, id);
    return this.getCustomer(id);
  }

  listAgents(): Agent[] {
    return this.db.prepare("SELECT * FROM agents").all() as Agent[];
  }

  private hydrate(row: TicketRow): Ticket {
    const messages = this.db
      .prepare("SELECT id, author, authorName, body, createdAt FROM messages WHERE ticketId = ? ORDER BY createdAt ASC")
      .all(row.id) as Message[];
    return {
      id: row.id,
      subject: row.subject,
      body: row.body,
      status: row.status,
      priority: row.priority,
      customerId: row.customerId,
      assigneeId: row.assigneeId,
      tags: JSON.parse(row.tags) as string[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messages,
    };
  }
}
