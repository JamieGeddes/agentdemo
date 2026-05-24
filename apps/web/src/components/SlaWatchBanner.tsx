import { useAgent } from "@copilotkit/react-core/v2";
import { useTickets } from "../state/TicketsProvider.js";

const AGENT_ID = "support_agent";

function newMessageId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `msg-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Proactive SLA watcher. The detection and alerting are autonomous: a slow clock
 * in TicketsProvider continuously recomputes which open/pending tickets are at
 * SLA risk, and this banner surfaces them without the rep asking.
 *
 * The triage *turn* is still client-triggered — the LangGraph graph can't wake
 * itself up, so "Ask Aria to triage" programmatically injects a user turn into
 * the live thread (agent.addMessage + agent.runAgent) and the existing triage
 * flow takes over. Mounted inside <CopilotKitProvider> so useAgent resolves.
 */
export function SlaWatchBanner() {
  const { slaAlerts } = useTickets();
  const { agent } = useAgent({ agentId: AGENT_ID });

  if (slaAlerts.length === 0) return null;

  const breaching = slaAlerts.filter((a) => a.risk.level === "breach").length;
  const top = slaAlerts[0];

  const askAria = async () => {
    if (!agent || agent.isRunning) return;
    const summary = slaAlerts
      .slice(0, 6)
      .map(
        (a) =>
          `${a.ticket.id} (${a.customer?.company ?? "?"}, ${a.customer?.plan ?? "?"} ${a.customer?.slaTier ?? ""}, ${a.risk.level})`,
      )
      .join("; ");
    agent.addMessage({
      id: newMessageId(),
      role: "user",
      content:
        `SLA watch: ${slaAlerts.length} ticket(s) are at SLA risk — ${summary}. ` +
        `Triage the open queue now: show the triage board, then propose reprioritization, ` +
        `assignment and escalation as ONE batch for me to approve.`,
    });
    await agent.runAgent();
  };

  return (
    <div className="sla-banner" role="status" aria-live="polite">
      <span className="sla-banner__dot" />
      <span className="sla-banner__text">
        <b>
          {slaAlerts.length} ticket{slaAlerts.length > 1 ? "s" : ""}
        </b>{" "}
        at SLA risk
        {breaching > 0 && <> · {breaching} breaching</>}
        {top && (
          <>
            {" "}
            — top: <b>{top.ticket.id}</b> ({top.customer?.company ?? "?"})
          </>
        )}
      </span>
      <button className="btn btn--sm" onClick={askAria}>
        Ask Aria to triage
      </button>
    </div>
  );
}
