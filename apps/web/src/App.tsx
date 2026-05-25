import { useCallback, useState } from "react";
import { CopilotKitProvider, CopilotSidebar } from "@copilotkit/react-core/v2";
import { api } from "./api.js";
import { TicketsProvider, useTickets } from "./state/TicketsProvider.js";
import { CopilotActions } from "./copilot/actions.js";
import { AriaProgressPanel } from "./components/AriaProgressPanel.js";
import { TicketList } from "./components/TicketList.js";
import { TicketDetail } from "./components/TicketDetail.js";
import { CustomersPage } from "./components/CustomersPage.js";

const AGENT_ID = "support_agent";

function Rail() {
  const { view, setView } = useTickets();
  const [resetting, setResetting] = useState(false);

  const resetDemo = useCallback(async () => {
    if (resetting) return;
    if (!window.confirm("Reset the demo? This restores all tickets, customers and the activity log to their defaults.")) {
      return;
    }
    setResetting(true);
    try {
      await api.reset();
      // Full reload re-fetches everything and clears in-memory state (selection,
      // filters, session id) so the demo starts truly fresh.
      window.location.reload();
    } catch {
      setResetting(false);
      window.alert("Reset failed — is the server running?");
    }
  }, [resetting]);

  return (
    <nav className="rail">
      <div className="rail__brand">H</div>
      <button
        className={`rail__item ${view === "inbox" ? "rail__item--active" : ""}`}
        title="Inbox"
        onClick={() => setView("inbox")}
      >
        ✉
      </button>
      <button
        className={`rail__item ${view === "customers" ? "rail__item--active" : ""}`}
        title="Customers"
        onClick={() => setView("customers")}
      >
        ◍
      </button>
      <button className="rail__item" title="Reports">▤</button>
      <button className="rail__item" title="Knowledge">📖</button>
      <div className="rail__spacer" />
      <button
        className="rail__item"
        title="Reset demo to defaults"
        onClick={resetDemo}
        disabled={resetting}
      >
        {resetting ? "…" : "⟳"}
      </button>
      <button className="rail__item" title="Settings">⚙</button>
    </nav>
  );
}

function Desk() {
  const { view } = useTickets();
  const [flashId, setFlashId] = useState<string | null>(null);
  const onFlash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1200);
  }, []);

  return (
    <div className="app">
      <Rail />
      {view === "inbox" ? (
        <>
          <TicketList flashId={flashId} onFlash={onFlash} />
          <TicketDetail />
        </>
      ) : (
        <CustomersPage />
      )}
      <CopilotActions onFlash={onFlash} />
    </div>
  );
}

export default function App() {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit" useSingleEndpoint showDevConsole={false}>
      <TicketsProvider>
        <Desk />
        <AriaProgressPanel />
        <CopilotSidebar
          agentId={AGENT_ID}
          isModalDefaultOpen
          labels={{
            modalHeaderTitle: "Aria · Support Copilot",
            welcomeMessageText:
              'Hi! I\'m Aria. Try: "show urgent open tickets", "open T-1001 and summarize it", "open Acme Robotics and summarize their account", or "upgrade Hooli to pro".',
          }}
        />
      </TicketsProvider>
    </CopilotKitProvider>
  );
}
