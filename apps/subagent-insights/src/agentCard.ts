import type { AgentCard } from "@a2a-js/sdk";
import { env } from "./env.js";

/**
 * The Insights agent's A2A Agent Card. The `skills[].description` strings are
 * what the main agent turns into its delegation-tool description, so they read as
 * capability statements. The `securitySchemes`/`security` advertise that a bearer
 * credential (the shared context) is expected on every call.
 */
export function buildAgentCard(): AgentCard {
  return {
    protocolVersion: "0.3.0",
    name: "Insights Agent",
    description:
      "Reporting and analytics over the support queue — SLA-breach risk, team workload, and customer health. Results are scoped to the caller's permission level.",
    version: "1.0.0",
    url: `${env.publicUrl}/a2a/jsonrpc`,
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    securitySchemes: {
      bearer: {
        type: "http",
        scheme: "bearer",
        description: "Simulated bearer token carrying the caller's identity and role (the shared context).",
      },
    },
    security: [{ bearer: [] }],
    skills: [
      {
        id: "sla_risk_report",
        name: "SLA risk report",
        description:
          "Rank open tickets by SLA-breach risk. Managers/admins additionally get customer details and a CSV export.",
        tags: ["sla", "reporting"],
        examples: ["Which tickets are about to breach their SLA?"],
      },
      {
        id: "team_performance",
        name: "Team performance",
        description: "Support-team workload: total open, unassigned, and per-rep load (per-rep for managers/admins).",
        tags: ["workload", "reporting"],
        examples: ["How is the team's workload spread right now?"],
      },
      {
        id: "customer_health",
        name: "Customer health",
        description:
          "An account's plan, SLA tier, seats and open/at-risk ticket counts (with contact details for managers/admins).",
        tags: ["customers", "reporting"],
        examples: ["How healthy is the Acme Robotics account?"],
      },
    ],
  };
}
