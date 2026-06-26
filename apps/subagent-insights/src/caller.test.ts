import { describe, expect, it } from "vitest";
import { mintToken } from "@agentdemo/shared";
import { getCaller, getRole, runWithCaller } from "./caller.js";
import { buildAgentCard } from "./agentCard.js";

describe("caller context", () => {
  it("defaults to readonly when no caller is set", () => {
    expect(getRole()).toBe("readonly");
    expect(getCaller()).toBeNull();
  });

  it("exposes the caller's role inside runWithCaller", () => {
    const token = mintToken({ id: "u1", name: "Dana Admin", role: "admin" });
    // decodeToken happens in the middleware; here we set the resolved identity directly.
    runWithCaller({ userId: "u1", userName: "Dana Admin", role: "admin" }, () => {
      expect(getRole()).toBe("admin");
      expect(getCaller()?.userName).toBe("Dana Admin");
    });
    // token is a valid shared credential shape
    expect(token.split(".").length).toBe(3);
    // context does not leak outside the run
    expect(getRole()).toBe("readonly");
  });
});

describe("agent card", () => {
  it("advertises the three skills and a bearer security scheme", () => {
    const card = buildAgentCard();
    expect(card.name).toBe("Insights Agent");
    expect(card.skills.map((s) => s.id).sort()).toEqual([
      "customer_health",
      "sla_risk_report",
      "team_performance",
    ]);
    expect(card.securitySchemes?.bearer).toMatchObject({ type: "http", scheme: "bearer" });
  });
});
