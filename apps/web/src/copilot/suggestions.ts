import type { View } from "../state/TicketsProvider.js";

/** One next-best-action chip shown in the chat (CopilotKit static suggestion). */
export interface ViewSuggestion {
  title: string;
  message: string;
}

export interface SuggestionContext {
  view: View;
  selectedTicketId: string | null;
  selectedCustomer: string | null;
}

/**
 * Pick the chat's next-best-action chips from the rep's current view. Pure (no
 * React) so it's unit-testable and can be fed straight to
 * `useConfigureSuggestions`. The chips mirror what Aria is good at from where
 * the rep is standing: a ticket open → summarize / reply / find docs; a
 * customer open → account health; otherwise inbox/customers triage.
 */
export function suggestionsForView(ctx: SuggestionContext): ViewSuggestion[] {
  if (ctx.view === "customers") {
    if (ctx.selectedCustomer) {
      const c = ctx.selectedCustomer;
      return [
        { title: "Account summary", message: `Summarize ${c}'s account.` },
        { title: "Open tickets", message: `Show open tickets for ${c}.` },
        { title: "Plan", message: `What plan is ${c} on, and is it right for them?` },
      ];
    }
    return [
      { title: "List customers", message: "Show all customers with their plan and SLA tier." },
      { title: "Enterprise accounts", message: "Which customers are on the enterprise plan?" },
    ];
  }

  // inbox
  if (ctx.selectedTicketId) {
    const id = ctx.selectedTicketId;
    return [
      { title: "Summarize", message: `Summarize ticket ${id}.` },
      { title: "Draft reply", message: `Draft a reply to the customer on ${id}.` },
      { title: "Find similar docs", message: `Search the knowledge base for the issue in ${id}.` },
    ];
  }
  return [
    { title: "Triage urgent", message: "Show the urgent open tickets." },
    { title: "Oldest first", message: "Sort the inbox by oldest first." },
  ];
}
