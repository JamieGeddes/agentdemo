import { z } from "zod";
import { createCatalog, type CatalogDefinitions, type CatalogRenderers } from "@copilotkit/a2ui-renderer";
import { TICKET_PRIORITIES } from "@agentdemo/shared";
import { PriorityPill } from "../components/pills.js";

/**
 * A small bespoke A2UI catalog for the support desk — the "bring your own
 * components" half of the A2UI demo.
 *
 * Unlike the fixed AG-UI cards (apps/web/src/components/cards.tsx), where the
 * component set is hard-coded and Aria only fills typed props, here Aria composes
 * the UI *structure itself* at runtime from these primitives. The two halves:
 *  - DEFINITIONS (Zod props + descriptions) are platform-agnostic and are what
 *    Aria sees: the provider forwards them to the agent as context
 *    (CopilotKitProvider `includeSchema`, default true), so the model knows which
 *    components it may use and with what props.
 *  - RENDERERS draw those components with the app's own CSS, so an Aria-composed
 *    surface looks native sitting next to the fixed cards.
 *
 * `includeBasicCatalog: true` also hands Aria the built-in primitives
 * (Text, Button, Row, Column, Card, List) for layout and the interactive buttons
 * whose clicks route back to Aria via the A2UI action round-trip.
 */
const definitions = {
  StatusBadge: {
    description:
      'A small SLA/status badge with custom text, e.g. "SLA 1h" or "2h over budget". ' +
      "tone sets the color: ok=green, warning=amber, breach=red, neutral=grey.",
    props: z.object({
      text: z.string(),
      tone: z.enum(["ok", "warning", "breach", "neutral"]).optional(),
    }),
  },
  PriorityPill: {
    description: "A ticket priority pill (low | normal | high | urgent).",
    props: z.object({ priority: z.enum(TICKET_PRIORITIES) }),
  },
  TicketRow: {
    description: "One ticket line: its id, a short subject, and an optional priority pill.",
    props: z.object({
      ticketId: z.string(),
      subject: z.string(),
      priority: z.enum(TICKET_PRIORITIES).optional(),
    }),
  },
} satisfies CatalogDefinitions;

const renderers: CatalogRenderers<typeof definitions> = {
  StatusBadge: ({ props }) => (
    <span className={props.tone && props.tone !== "neutral" ? `pill pill--sla-${props.tone}` : "pill"}>
      {props.text}
    </span>
  ),
  PriorityPill: ({ props }) => <PriorityPill priority={props.priority} />,
  TicketRow: ({ props }) => (
    <div className="triage__row">
      <div className="triage__head">
        <span className="triage__ticket">{props.ticketId}</span>
        <span className="triage__verb">{props.subject}</span>
        {props.priority && <PriorityPill priority={props.priority} />}
      </div>
    </div>
  ),
};

export const supportCatalog = createCatalog(definitions, renderers, {
  catalogId: "vela-support",
  includeBasicCatalog: true,
});
