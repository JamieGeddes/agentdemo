import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerTools } from "./server.js";

const API = "http://test.local";

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("server tools", () => {
  it("list_tickets builds the query string and returns compact summaries", async () => {
    const fetchMock = mockFetch([
      { id: "T-1", subject: "x", status: "open", priority: "high", customerId: "c1", assigneeId: null, tags: [], updatedAt: "t", body: "secret-body", messages: [] },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const [listTickets] = createServerTools(API);
    const out = await listTickets.invoke({ status: "open", priority: "high" });

    const url = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("status=open");
    expect(url).toContain("priority=high");
    // compact projection should not leak the full body
    expect(out).not.toContain("secret-body");
    expect(out).toContain("T-1");
  });

  it("get_ticket returns the full ticket json", async () => {
    const ticket = { id: "T-1001", subject: "CORS", messages: [{ id: "m1", body: "hi" }] };
    vi.stubGlobal("fetch", mockFetch(ticket));

    const [, getTicket] = createServerTools(API);
    const out = await getTicket.invoke({ id: "T-1001" });
    expect(JSON.parse(out as string).id).toBe("T-1001");
  });

  it("get_ticket reports a missing ticket on 404", async () => {
    vi.stubGlobal("fetch", mockFetch({}, 404));
    const [, getTicket] = createServerTools(API);
    const out = await getTicket.invoke({ id: "nope" });
    expect(out).toMatch(/no ticket found/i);
  });
});
