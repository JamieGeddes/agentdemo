import { describe, expect, it } from "vitest";
import { SLA_WARNING_FRACTION, slaBudgetMs, slaRisk } from "./sla.js";
import type { Ticket } from "./types.js";

const HOUR = 60 * 60 * 1000;

/** Minimal ticket factory for the bits slaRisk reads. */
function tk(status: Ticket["status"], createdAt: string): Pick<Ticket, "status" | "createdAt"> {
  return { status, createdAt };
}

describe("slaBudgetMs", () => {
  it("parses hour tiers", () => {
    expect(slaBudgetMs("1h")).toBe(HOUR);
    expect(slaBudgetMs("8h")).toBe(8 * HOUR);
    expect(slaBudgetMs("24h")).toBe(24 * HOUR);
  });

  it("tolerates whitespace and case", () => {
    expect(slaBudgetMs("  2H ")).toBe(2 * HOUR);
  });

  it("falls back to 24h for anything unparseable", () => {
    expect(slaBudgetMs("soon")).toBe(24 * HOUR);
  });
});

describe("slaRisk", () => {
  const created = "2026-05-18T06:00:00.000Z";
  const createdMs = Date.parse(created);

  it("breaches once the budget is fully spent (T-1004 style: enterprise 1h)", () => {
    const now = createdMs + 2 * HOUR; // 2h elapsed vs 1h budget
    const risk = slaRisk(tk("open", created), "1h", now);
    expect(risk.level).toBe("breach");
    expect(risk.fractionUsed).toBeCloseTo(2);
  });

  it("warns in the 0.75–1.0 band", () => {
    const now = createdMs + SLA_WARNING_FRACTION * 8 * HOUR; // exactly the threshold on an 8h budget
    expect(slaRisk(tk("open", created), "8h", now).level).toBe("warning");
  });

  it("is ok well within budget (free 24h, fresh ticket)", () => {
    const now = createdMs + 1 * HOUR;
    expect(slaRisk(tk("open", created), "24h", now).level).toBe("ok");
  });

  it("treats settled tickets as ok regardless of age", () => {
    const now = createdMs + 1000 * HOUR;
    expect(slaRisk(tk("resolved", created), "1h", now).level).toBe("ok");
    expect(slaRisk(tk("closed", created), "1h", now).fractionUsed).toBe(0);
  });

  it("clamps a future createdAt to zero elapsed", () => {
    const now = createdMs - HOUR;
    const risk = slaRisk(tk("open", created), "1h", now);
    expect(risk.elapsedMs).toBe(0);
    expect(risk.level).toBe("ok");
  });

  it("honors the exact breach boundary (fraction == 1.0)", () => {
    const now = createdMs + 1 * HOUR;
    expect(slaRisk(tk("pending", created), "1h", now).level).toBe("breach");
  });
});
