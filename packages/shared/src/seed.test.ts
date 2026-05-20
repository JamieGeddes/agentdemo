import { describe, expect, it } from "vitest";
import { isTicketPriority, isTicketStatus, priorityRank } from "./guards.js";
import { seedAgents, seedCustomers, seedTickets } from "./seed.js";

describe("seed data integrity", () => {
  it("has tickets, customers, and agents", () => {
    expect(seedTickets.length).toBeGreaterThanOrEqual(8);
    expect(seedCustomers.length).toBeGreaterThan(0);
    expect(seedAgents.length).toBeGreaterThan(0);
  });

  it("uses unique ticket ids", () => {
    const ids = seedTickets.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references valid customers and assignees", () => {
    const customerIds = new Set(seedCustomers.map((c) => c.id));
    const agentIds = new Set(seedAgents.map((a) => a.id));
    for (const t of seedTickets) {
      expect(customerIds.has(t.customerId)).toBe(true);
      if (t.assigneeId !== null) {
        expect(agentIds.has(t.assigneeId)).toBe(true);
      }
    }
  });

  it("only uses valid status and priority enums", () => {
    for (const t of seedTickets) {
      expect(isTicketStatus(t.status)).toBe(true);
      expect(isTicketPriority(t.priority)).toBe(true);
    }
  });

  it("has unique message ids across all tickets", () => {
    const messageIds = seedTickets.flatMap((t) => t.messages.map((m) => m.id));
    expect(new Set(messageIds).size).toBe(messageIds.length);
  });
});

describe("guards", () => {
  it("rejects unknown values", () => {
    expect(isTicketStatus("nope")).toBe(false);
    expect(isTicketPriority(42)).toBe(false);
  });

  it("ranks priority from low to urgent", () => {
    expect(priorityRank("low")).toBeLessThan(priorityRank("urgent"));
    expect(priorityRank("normal")).toBeLessThan(priorityRank("high"));
  });
});
