import { useAgent } from "@copilotkit/react-core/v2";
import type { AriaStep } from "@agentdemo/shared";

const AGENT_ID = "support_agent";

/**
 * Live "watch Aria work" panel. Reads the agent's streamed `aria_steps` state
 * (written by the `ariaProgress` middleware in apps/agent) and renders it as a
 * timeline while a turn is in flight. This is generative UI driven by *agent
 * state* — distinct from the per-tool-call cards rendered by the chat itself.
 *
 * It self-hides when there's nothing running and the last run has settled, so
 * it stays out of the way between turns. Mounted as a sibling of the sidebar in
 * App.tsx (must be inside <CopilotKitProvider> for useAgent to resolve).
 */
export function AriaProgressPanel() {
  // throttleMs coalesces the high-frequency STATE_DELTA stream into calm re-renders.
  const { agent } = useAgent({ agentId: AGENT_ID, throttleMs: 100 });
  const steps = ((agent?.state as { aria_steps?: AriaStep[] } | undefined)?.aria_steps ?? []) as AriaStep[];

  const anyRunning = steps.some((s) => s.status === "running");
  // Show while work is in flight. Once everything is done we keep it hidden —
  // the chat transcript already carries the result cards.
  if (steps.length === 0 || !anyRunning) return null;

  return (
    <div className="aria-panel" role="status" aria-live="polite">
      <div className="gcard">
        <div className="gcard__label">⚡ Aria is working</div>
        <ul className="aria-steps">
          {steps.map((s) => (
            <li key={s.id} className={`aria-step aria-step--${s.status}`}>
              <span className="aria-step__mark">{s.status === "done" ? "✓" : ""}</span>
              <span className="aria-step__label">
                {s.label}
                {s.detail && <span className="aria-step__detail"> · {s.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
