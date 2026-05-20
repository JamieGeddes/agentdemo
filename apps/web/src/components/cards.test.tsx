import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KnowledgeCitationCard, ReplyApprovalCard, TicketSummaryCard } from "./cards.js";

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

  it("renders a knowledge citation with its repo source", () => {
    render(<KnowledgeCitationCard question="How to enable CORS?" answer="Use @fastify/cors." repo="fastify/fastify" />);
    expect(screen.getByText("How to enable CORS?")).toBeInTheDocument();
    expect(screen.getByText("fastify/fastify")).toBeInTheDocument();
    expect(screen.getByText(/DeepWiki MCP/)).toBeInTheDocument();
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
});
