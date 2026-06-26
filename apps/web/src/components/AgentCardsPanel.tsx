import { useEffect, useState } from "react";
import { api, type AgentCardLink } from "../api.js";

/**
 * A small demo affordance: a collapsible panel listing the A2A **Agent Cards** —
 * the main agent plus each registered subagent — with a live reachability dot and a
 * link that opens each `/.well-known/agent-card.json`. Polls `/api/agent-cards`
 * (server-probed, since the subagents don't send CORS headers), so a subagent
 * coming online via `dev:subagents` flips its dot green within a few seconds —
 * pairs with the dynamic-registration demo.
 */
export function AgentCardsPanel() {
  const [cards, setCards] = useState<AgentCardLink[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.listAgentCards().then((c) => alive && setCards(c)).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const up = cards.filter((c) => c.reachable).length;

  return (
    <div className="cards-panel">
      {open && (
        <ul className="cards-panel__list">
          <li className="cards-panel__head">A2A Agent Cards</li>
          {cards.map((c) => (
            <li key={c.id} className="cards-panel__row">
              <span
                className={`cards-panel__dot cards-panel__dot--${c.reachable ? "up" : "down"}`}
                title={c.reachable ? "reachable" : "offline"}
              />
              <span className="cards-panel__name">
                {c.name}
                {c.kind === "main" && <span className="cards-panel__tag">main</span>}
              </span>
              <a className="cards-panel__link" href={c.cardUrl} target="_blank" rel="noreferrer">
                card ↗
              </a>
            </li>
          ))}
          {cards.length === 0 && <li className="cards-panel__empty">No agent cards found.</li>}
        </ul>
      )}
      <button className="cards-panel__toggle" onClick={() => setOpen((o) => !o)} title="A2A Agent Cards">
        🪪 Agent cards <span className="cards-panel__count">{up}/{cards.length}</span> {open ? "▾" : "▸"}
      </button>
    </div>
  );
}
