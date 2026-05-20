import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TicketsProvider, useTickets } from "./TicketsProvider.js";

const ticket = {
  id: "T-1001",
  subject: "CORS errors",
  body: "b",
  status: "open",
  priority: "urgent",
  customerId: "c1",
  assigneeId: null,
  tags: [],
  createdAt: "2026-05-18T08:00:00.000Z",
  updatedAt: "2026-05-18T08:00:00.000Z",
  messages: [],
};

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/tickets") && init?.method === "PATCH") {
      return new Response(JSON.stringify({ ...ticket, status: "resolved" }), { status: 200 });
    }
    if (url.startsWith("/api/tickets")) return new Response(JSON.stringify([ticket]), { status: 200 });
    if (url.startsWith("/api/customers")) return new Response(JSON.stringify([{ id: "c1", company: "Acme" }]), { status: 200 });
    if (url.startsWith("/api/agents")) return new Response(JSON.stringify([]), { status: 200 });
    return new Response("[]", { status: 200 });
  }) as unknown as typeof fetch;
}

function Probe() {
  const { tickets, patchTicket } = useTickets();
  return (
    <div>
      <span data-testid="count">{tickets.length}</span>
      <span data-testid="status">{tickets[0]?.status}</span>
      <button onClick={() => void patchTicket("T-1001", { status: "resolved" })}>resolve</button>
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("TicketsProvider", () => {
  it("loads tickets from the API and applies optimistic patches", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(
      <TicketsProvider>
        <Probe />
      </TicketsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("status").textContent).toBe("open");

    fireEvent.click(screen.getByText("resolve"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("resolved"));
  });
});
