import { describe, expect, it } from "vitest";
import { buildSeedTickets, seedAgents, seedCustomers } from "@agentdemo/shared";
import { customerHealth, slaRiskReport, teamPerformance } from "./insights.js";

const NOW = Date.parse("2030-01-01T00:00:00.000Z");
const tickets = buildSeedTickets(NOW);

describe("slaRiskReport authorization tiers", () => {
  it("readonly gets a summary with counts but no PII or export", () => {
    const r = slaRiskReport(tickets, seedCustomers, "readonly", NOW);
    expect(r.scope).toBe("summary");
    expect(r.counts.breach).toBe(2);
    expect(r).not.toHaveProperty("ranked");
    expect(r).not.toHaveProperty("csvExport");
    expect(JSON.stringify(r)).not.toContain("@"); // no contact emails leak
  });

  it("manager gets the full ranked report with a CSV export", () => {
    const r = slaRiskReport(tickets, seedCustomers, "manager", NOW);
    expect(r.scope).toBe("full");
    if (r.scope !== "full") return;
    expect(r.ranked.length).toBeGreaterThan(0);
    expect(r.csvExport).toContain("ticketId,level");
    expect(r.csvExport).toContain("@"); // contact emails are included for managers
    // ranked is ordered by percentUsed descending
    const pct = r.ranked.map((x) => x.percentUsed);
    expect([...pct].sort((a, b) => b - a)).toEqual(pct);
  });

  it("admin is treated at least as a manager", () => {
    expect(slaRiskReport(tickets, seedCustomers, "admin", NOW).scope).toBe("full");
  });
});

describe("teamPerformance authorization tiers", () => {
  it("readonly gets aggregates only, no per-rep names", () => {
    const r = teamPerformance(tickets, seedAgents, "readonly");
    expect(r.scope).toBe("summary");
    expect(r).not.toHaveProperty("perRep");
    expect(typeof r.totalOpen).toBe("number");
  });

  it("manager gets the per-rep breakdown", () => {
    const r = teamPerformance(tickets, seedAgents, "manager");
    expect(r.scope).toBe("full");
    if (r.scope !== "full") return;
    expect(r.perRep.length).toBe(seedAgents.length);
    expect(r.perRep[0]).toHaveProperty("name");
  });
});

describe("customerHealth authorization tiers", () => {
  const acme = seedCustomers[0];

  it("readonly omits contact details", () => {
    const r = customerHealth(acme, tickets, "readonly", NOW);
    expect(r.scope).toBe("summary");
    expect(r).not.toHaveProperty("contactEmail");
    expect(r.seats).toBe(acme.seats);
  });

  it("manager includes contact details", () => {
    const r = customerHealth(acme, tickets, "manager", NOW);
    expect(r.scope).toBe("full");
    if (r.scope !== "full") return;
    expect(r.contactEmail).toBe(acme.email);
  });
});
