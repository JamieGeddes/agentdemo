import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "./db.js";
import { TicketStore } from "./ticketStore.js";

function freshStore() {
  return new TicketStore(createDb(":memory:"));
}

describe("TicketStore", () => {
  let store: TicketStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("seeds tickets, customers, and agents", () => {
    expect(store.list().length).toBeGreaterThanOrEqual(8);
    expect(store.listCustomers().length).toBeGreaterThan(0);
    expect(store.listAgents().length).toBeGreaterThan(0);
  });

  it("filters by status and priority", () => {
    const open = store.list({ status: "open" });
    expect(open.every((t) => t.status === "open")).toBe(true);

    const urgent = store.list({ priority: "urgent" });
    expect(urgent.every((t) => t.priority === "urgent")).toBe(true);
  });

  it("searches subject and body", () => {
    const results = store.list({ search: "cors" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((t) => /cors/i.test(t.subject) || /cors/i.test(t.body))).toBe(true);
  });

  it("sorts by priority (most urgent first)", () => {
    const sorted = store.list({ sort: "priority" });
    const ranks = sorted.map((t) => ["low", "normal", "high", "urgent"].indexOf(t.priority));
    const isDescending = ranks.every((r, i) => i === 0 || ranks[i - 1] >= r);
    expect(isDescending).toBe(true);
  });

  it("updates status and priority and bumps updatedAt", () => {
    const ticket = store.list()[0];
    const before = ticket.updatedAt;
    const updated = store.update(ticket.id, { status: "resolved", priority: "low" });
    expect(updated?.status).toBe("resolved");
    expect(updated?.priority).toBe("low");
    expect(updated?.updatedAt).not.toBe(before);
  });

  it("appends a message to the thread", () => {
    const ticket = store.list()[0];
    const count = ticket.messages.length;
    const updated = store.addMessage(ticket.id, {
      author: "agent",
      authorName: "Maya Chen",
      body: "Following up on this.",
    });
    expect(updated?.messages.length).toBe(count + 1);
    expect(updated?.messages.at(-1)?.body).toBe("Following up on this.");
  });

  it("returns null for unknown tickets", () => {
    expect(store.get("nope")).toBeNull();
    expect(store.update("nope", { status: "closed" })).toBeNull();
    expect(store.addMessage("nope", { author: "agent", authorName: "x", body: "y" })).toBeNull();
  });
});
