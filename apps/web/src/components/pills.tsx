import type { Agent, CustomerPlan, SlaLevel, TicketPriority, TicketStatus } from "@agentdemo/shared";

export function StatusPill({ status }: { status: TicketStatus }) {
  return <span className={`pill pill--${status}`}>{status}</span>;
}

const SLA_LABEL: Record<SlaLevel, string> = {
  ok: "On track",
  warning: "SLA at risk",
  breach: "SLA breach",
};

export function SlaRiskPill({ level }: { level: SlaLevel }) {
  return <span className={`pill pill--sla-${level}`}>{SLA_LABEL[level]}</span>;
}

export function PriorityPill({ priority }: { priority: TicketPriority }) {
  return <span className={`pill pill--${priority}`}>{priority}</span>;
}

export function PlanBadge({ plan }: { plan: CustomerPlan }) {
  return <span className={`plan plan--${plan}`}>{plan}</span>;
}

export function AssigneeChip({ agent }: { agent?: Agent }) {
  if (!agent) return <span className="unassigned">Unassigned</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="avatar">{agent.avatar}</span>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{agent.name}</span>
    </span>
  );
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
