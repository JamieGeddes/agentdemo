import { describe, expect, it } from "vitest";
import { isTicketPriority, isTicketStatus, priorityRank } from "./guards.js";
import { buildSeedTickets, seedAgents, seedCustomers, seedTickets } from "./seed.js";
import { slaRisk } from "./sla.js";

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

  it("yields a stable SLA mix (2 breach, 2 warning) at any wall-clock time", () => {
    // Pick an arbitrary anchor far from the offsets' authoring date: the mix must
    // hold purely from the relative offsets, never from a fixed calendar date.
    const now = Date.parse("2030-01-01T00:00:00.000Z");
    const tierOf = (customerId: string) =>
      seedCustomers.find((c) => c.id === customerId)?.slaTier ?? "24h";

    const levels = buildSeedTickets(now).map((t) => slaRisk(t, tierOf(t.customerId), now).level);
    const count = (level: string) => levels.filter((l) => l === level).length;

    expect(count("breach")).toBe(2);
    expect(count("warning")).toBe(2);
    // The remaining tickets (active-but-ok plus settled resolved/closed) are ok.
    expect(count("ok")).toBe(levels.length - 4);
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
