import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssigneeChip, PriorityPill, StatusPill, relativeTime } from "./pills.js";

describe("pills", () => {
  it("renders status and priority with semantic classes", () => {
    const { container } = render(
      <>
        <StatusPill status="open" />
        <PriorityPill priority="urgent" />
      </>,
    );
    expect(container.querySelector(".pill--open")).toBeTruthy();
    expect(container.querySelector(".pill--urgent")).toBeTruthy();
  });

  it("shows Unassigned when there is no agent", () => {
    render(<AssigneeChip />);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("formats relative time", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMinAgo)).toMatch(/m ago/);
  });
});
