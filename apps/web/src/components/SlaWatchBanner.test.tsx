import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// useAgent is mocked so we can assert the banner injects a turn (addMessage + runAgent).
const { addMessage, runAgent } = vi.hoisted(() => ({
  addMessage: vi.fn(),
  runAgent: vi.fn(async () => {}),
}));
vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: { isRunning: false, addMessage, runAgent } }),
}));

import { TicketsProvider } from "../state/TicketsProvider.js";
import { SlaWatchBanner } from "./SlaWatchBanner.js";

// Enterprise (1h SLA) ticket raised days ago → breaching against the real clock.
const ticket = {
  id: "T-1004",
  subject: "Webhook 401",
  body: "b",
  status: "open",
  priority: "high",
  customerId: "c4",
  assigneeId: null,
  tags: [],
  createdAt: "2026-05-18T06:30:00.000Z",
  updatedAt: "2026-05-18T07:00:00.000Z",
  messages: [],
};

function mockFetch() {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith("/api/tickets")) return new Response(JSON.stringify([ticket]), { status: 200 });
    if (u.startsWith("/api/customers"))
      return new Response(
        JSON.stringify([{ id: "c4", company: "Umbrella Health", plan: "enterprise", slaTier: "1h" }]),
        { status: 200 },
      );
    if (u.startsWith("/api/agents")) return new Response(JSON.stringify([]), { status: 200 });
    return new Response("[]", { status: 200 });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  addMessage.mockClear();
  runAgent.mockClear();
  vi.restoreAllMocks();
});

describe("SlaWatchBanner", () => {
  it("surfaces an at-risk ticket and injects a triage turn on click", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(
      <TicketsProvider>
        <SlaWatchBanner />
      </TicketsProvider>,
    );

    await waitFor(() => expect(screen.getByText(/at SLA risk/)).toBeInTheDocument());
    expect(screen.getByText("T-1004")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Ask Aria to triage/));
    expect(addMessage).toHaveBeenCalledOnce();
    expect(addMessage.mock.calls[0][0]).toMatchObject({ role: "user" });
    expect(addMessage.mock.calls[0][0].content).toMatch(/SLA watch/);
    await waitFor(() => expect(runAgent).toHaveBeenCalledOnce());
  });
});
