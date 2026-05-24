import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ActivityRecapCard,
  BatchTriageApprovalCard,
  KnowledgeCitationCard,
  RelatedTicketsCard,
  ReplyApprovalCard,
  TicketSummaryCard,
  TriageBoardCard,
  type BatchActionRow,
} from "./cards.js";

describe("generative-UI cards", () => {
  it("renders a ticket summary with highlights and suggested priority", () => {
    render(
      <TicketSummaryCard
        ticketId="T-1001"
        summary="Customer hit CORS errors after upgrade."
        highlights={["Blocking production", "React frontend"]}
        suggestedPriority="urgent"
      />,
    );
    expect(screen.getByText(/T-1001/)).toBeInTheDocument();
    expect(screen.getByText(/CORS errors/)).toBeInTheDocument();
    expect(screen.getByText("Blocking production")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders a DeepWiki citation with its repo reference", () => {
    render(
      <KnowledgeCitationCard
        question="How to enable CORS?"
        answer="Use @fastify/cors."
        source="DeepWiki"
        reference="fastify/fastify"
      />,
    );
    expect(screen.getByText("How to enable CORS?")).toBeInTheDocument();
    expect(screen.getByText("fastify/fastify")).toBeInTheDocument();
    expect(screen.getByText(/DeepWiki MCP/)).toBeInTheDocument();
  });

  it("renders an internal-runbook citation", () => {
    render(
      <KnowledgeCitationCard
        question="Why are webhooks 401-ing?"
        answer="The signing secret rotated."
        source="Runbook"
        reference="rb-webhook-hmac"
      />,
    );
    expect(screen.getAllByText(/Internal runbook/).length).toBeGreaterThan(0);
    expect(screen.getByText("rb-webhook-hmac")).toBeInTheDocument();
  });

  it("reply approval card fires approve / cancel and shows outcome", () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ReplyApprovalCard ticketId="T-1004" message="Sorry about that!" status="executing" onApprove={onApprove} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText(/Approve/));
    expect(onApprove).toHaveBeenCalledOnce();

    rerender(
      <ReplyApprovalCard ticketId="T-1004" message="Sorry about that!" status="executing" onApprove={onApprove} onCancel={onCancel} outcome="sent" />,
    );
    expect(screen.getByText(/Reply sent/)).toBeInTheDocument();
  });

  it("triage board ranks breach before ok and shows the SLA pill", () => {
    render(
      <TriageBoardCard
        status="complete"
        rows={[
          { ticketId: "T-1005", slaRisk: "ok", priority: "low", proposedAction: "leave as-is" },
          { ticketId: "T-1004", slaRisk: "breach", priority: "high", proposedAction: "escalate" },
        ]}
      />,
    );
    expect(screen.getByText("SLA breach")).toBeInTheDocument();
    // Breaching ticket should be ordered before the on-track one.
    const tickets = screen.getAllByText(/^T-\d+$/).map((n) => n.textContent);
    expect(tickets.indexOf("T-1004")).toBeLessThan(tickets.indexOf("T-1005"));
  });
});

describe("batch-triage approval card", () => {
  const actions: BatchActionRow[] = [
    { id: "r1", kind: "escalate", ticketId: "T-1004", reason: "Enterprise 1h SLA breached" },
    { id: "r2", kind: "assign", ticketId: "T-1002", assigneeName: "Sofia", reason: "Unassigned high-priority" },
  ];
  const noop = () => {};

  it("fires per-row approve and shows applied/skipped badges", () => {
    const onApproveRow = vi.fn();
    const { rerender } = render(
      <BatchTriageApprovalCard
        rationale="SLA triage"
        actions={actions}
        decisions={{}}
        status="complete"
        terminal={false}
        summary={null}
        onApproveRow={onApproveRow}
        onSkipRow={noop}
        onApproveAll={noop}
        onFinish={noop}
        onDiscardAll={noop}
      />,
    );
    fireEvent.click(screen.getAllByText("Approve")[0]);
    expect(onApproveRow).toHaveBeenCalledWith("r1");

    rerender(
      <BatchTriageApprovalCard
        rationale="SLA triage"
        actions={actions}
        decisions={{ r1: "approved", r2: "skipped" }}
        status="complete"
        terminal={false}
        summary={null}
        onApproveRow={onApproveRow}
        onSkipRow={noop}
        onApproveAll={noop}
        onFinish={noop}
        onDiscardAll={noop}
      />,
    );
    expect(screen.getByText("✓ Applied")).toBeInTheDocument();
    expect(screen.getByText("— Skipped")).toBeInTheDocument();
  });

  it("shows the summary and hides buttons once terminal", () => {
    render(
      <BatchTriageApprovalCard
        rationale="SLA triage"
        actions={actions}
        decisions={{ r1: "approved", r2: "skipped" }}
        status="complete"
        terminal
        summary="Rep approved 1 of 2: T-1004 escalated → urgent. Skipped: T-1002."
        onApproveRow={noop}
        onSkipRow={noop}
        onApproveAll={noop}
        onFinish={noop}
        onDiscardAll={noop}
      />,
    );
    expect(screen.getByText(/Rep approved 1 of 2/)).toBeInTheDocument();
    expect(screen.queryByText("Approve all")).not.toBeInTheDocument();
  });

  it("shows a skeleton while the plan is still streaming", () => {
    const { container } = render(
      <BatchTriageApprovalCard
        rationale=""
        actions={[]}
        decisions={{}}
        status="inProgress"
        terminal={false}
        summary={null}
        onApproveRow={noop}
        onSkipRow={noop}
        onApproveAll={noop}
        onFinish={noop}
        onDiscardAll={noop}
      />,
    );
    expect(container.querySelector(".gcard__skeleton")).toBeInTheDocument();
  });
});

describe("intelligence + recap cards", () => {
  it("related-tickets card shows the connection and ticket ids", () => {
    render(
      <RelatedTicketsCard
        status="complete"
        connection="Both Globex tickets are frontend perf/timeout issues"
        rows={[
          { ticketId: "T-1002", subject: "Streaming cut off", note: "timeout" },
          { ticketId: "T-1006", subject: "Re-renders", note: "perf" },
        ]}
      />,
    );
    expect(screen.getByText(/frontend perf\/timeout/)).toBeInTheDocument();
    expect(screen.getByText("T-1002")).toBeInTheDocument();
    expect(screen.getByText("T-1006")).toBeInTheDocument();
  });

  it("activity recap lists each change with a count", () => {
    render(
      <ActivityRecapCard
        status="complete"
        items={[
          { summary: "T-1004 escalated → urgent", ticketId: "T-1004" },
          { summary: "T-1002 assigned → Sofia", ticketId: "T-1002" },
        ]}
      />,
    );
    expect(screen.getByText(/2 changes/)).toBeInTheDocument();
    expect(screen.getByText("T-1004 escalated → urgent")).toBeInTheDocument();
  });

  it("activity recap handles an empty session", () => {
    render(<ActivityRecapCard status="complete" items={[]} />);
    expect(screen.getByText(/No changes recorded/)).toBeInTheDocument();
  });
});
