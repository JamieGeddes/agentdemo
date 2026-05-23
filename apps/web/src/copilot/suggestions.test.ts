import { describe, expect, it } from "vitest";
import { suggestionsForView } from "./suggestions.js";

describe("suggestionsForView", () => {
  it("offers summarize/reply/docs when a ticket is open in the inbox", () => {
    const out = suggestionsForView({ view: "inbox", selectedTicketId: "T-1003", selectedCustomer: null });
    expect(out.map((s) => s.title)).toEqual(["Summarize", "Draft reply", "Find similar docs"]);
    // the open ticket id is threaded into the message the agent receives
    expect(out.every((s) => s.message.includes("T-1003"))).toBe(true);
  });

  it("offers triage chips for the inbox with no ticket open", () => {
    const out = suggestionsForView({ view: "inbox", selectedTicketId: null, selectedCustomer: null });
    expect(out.map((s) => s.title)).toEqual(["Triage urgent", "Oldest first"]);
  });

  it("offers account chips when a customer is open", () => {
    const out = suggestionsForView({ view: "customers", selectedTicketId: null, selectedCustomer: "Acme Robotics" });
    expect(out.map((s) => s.title)).toEqual(["Account summary", "Open tickets", "Plan"]);
    expect(out.every((s) => s.message.includes("Acme Robotics"))).toBe(true);
  });

  it("offers customer-list chips on the customers page with none open", () => {
    const out = suggestionsForView({ view: "customers", selectedTicketId: null, selectedCustomer: null });
    expect(out.map((s) => s.title)).toEqual(["List customers", "Enterprise accounts"]);
  });
});
