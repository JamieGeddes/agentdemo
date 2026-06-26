import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentCardsPanel } from "./AgentCardsPanel.js";

const cards = [
  { id: "support_agent", name: "Aria", kind: "main", cardUrl: "http://localhost:4000/.well-known/agent-card.json", reachable: true },
  { id: "insights", name: "Insights Agent", kind: "subagent", cardUrl: "http://insights-agent.vela.internal:4200/.well-known/agent-card.json", reachable: true },
  { id: "account_admin", name: "Account Admin", kind: "subagent", cardUrl: "http://account-admin.vela.internal:4300/.well-known/agent-card.json", reachable: false },
];

afterEach(() => vi.restoreAllMocks());

describe("AgentCardsPanel", () => {
  it("shows the reachable count and, when expanded, links each card to its well-known endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(cards), { status: 200 })));
    render(<AgentCardsPanel />);

    const toggle = screen.getByTitle("A2A Agent Cards");
    await waitFor(() => expect(toggle.textContent).toContain("2/3")); // 2 of 3 reachable

    fireEvent.click(toggle);
    expect(screen.getByText("Insights Agent")).toBeInTheDocument();

    const insightsLink = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href")?.includes("insights-agent.vela.internal:4200/.well-known/agent-card.json"));
    expect(insightsLink).toBeTruthy();
    expect(insightsLink).toHaveAttribute("target", "_blank");
  });
});
