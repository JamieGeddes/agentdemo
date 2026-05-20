import { useCallback, useState } from "react";
import { CopilotKitProvider, CopilotSidebar, WildcardToolCallRender } from "@copilotkit/react-core/v2";
import { TicketsProvider } from "./state/TicketsProvider.js";
import { CopilotActions } from "./copilot/actions.js";
import { TicketList } from "./components/TicketList.js";
import { TicketDetail } from "./components/TicketDetail.js";

const AGENT_ID = "support_agent";

function Rail() {
  return (
    <nav className="rail">
      <div className="rail__brand">H</div>
      <button className="rail__item rail__item--active" title="Inbox">✉</button>
      <button className="rail__item" title="Customers">◍</button>
      <button className="rail__item" title="Reports">▤</button>
      <button className="rail__item" title="Knowledge">📖</button>
      <div className="rail__spacer" />
      <button className="rail__item" title="Settings">⚙</button>
    </nav>
  );
}

function Desk() {
  const [flashId, setFlashId] = useState<string | null>(null);
  const onFlash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1200);
  }, []);

  return (
    <div className="app">
      <Rail />
      <TicketList flashId={flashId} />
      <TicketDetail />
      <CopilotActions onFlash={onFlash} />
    </div>
  );
}

export default function App() {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      showDevConsole={false}
      renderToolCalls={[WildcardToolCallRender]}
    >
      <TicketsProvider>
        <Desk />
        <CopilotSidebar
          agentId={AGENT_ID}
          isModalDefaultOpen
          labels={{
            modalHeaderTitle: "Aria · Support Copilot",
            welcomeMessageText:
              'Hi! I\'m Aria. Try: "show urgent open tickets", "open T-1001 and summarize it", "look up how to enable CORS in Fastify", or "draft a reply for T-1004".',
          }}
        />
      </TicketsProvider>
    </CopilotKitProvider>
  );
}
