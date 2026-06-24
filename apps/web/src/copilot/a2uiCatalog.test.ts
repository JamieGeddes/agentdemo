import { describe, expect, it } from "vitest";
import { supportCatalog } from "./a2uiCatalog.js";

// The A2UI round-trip itself is live-only (it needs the model to emit A2UI JSON),
// but the catalog is plain data we can verify offline: it must build, carry our
// catalogId, expose the bespoke support components, and — because of
// `includeBasicCatalog: true` — still include the built-in layout/primitive set
// Aria composes with.
describe("supportCatalog", () => {
  const names = new Set(supportCatalog.components.keys());

  it("uses the vela-support catalog id", () => {
    expect(supportCatalog.id).toBe("vela-support");
  });

  it("exposes the bespoke support components", () => {
    expect(names.has("StatusBadge")).toBe(true);
    expect(names.has("PriorityPill")).toBe(true);
    expect(names.has("TicketRow")).toBe(true);
  });

  it("merges in the basic catalog primitives", () => {
    for (const basic of ["Text", "Button", "Row", "Column", "Card"]) {
      expect(names.has(basic)).toBe(true);
    }
  });
});
