import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type { Agent, Customer, Ticket } from "@agentdemo/shared";
import { env } from "./env.js";
import { getRole } from "./caller.js";
import { customerHealth, slaRiskReport, teamPerformance } from "./insights.js";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${env.serverApiUrl}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The insights agent's tools. Each reads the caller's role (from the bearer token
 * decoded at the HTTP layer) and returns a role-appropriate result — the
 * authorization is enforced here in code, not left to the LLM.
 */
export function createInsightsTools(): StructuredToolInterface[] {
  const slaReport = tool(
    async () => {
      const [tickets, customers] = await Promise.all([
        fetchJson<Ticket[]>("/api/tickets"),
        fetchJson<Customer[]>("/api/customers"),
      ]);
      return JSON.stringify(slaRiskReport(tickets, customers, getRole()));
    },
    {
      name: "sla_risk_report",
      description:
        "SLA-breach risk across the open ticket queue, ranked by how much of each customer's response-time budget is spent. Managers/admins also get customer details and a CSV export.",
      schema: z.object({}),
    },
  );

  const team = tool(
    async () => {
      const [tickets, agents] = await Promise.all([
        fetchJson<Ticket[]>("/api/tickets"),
        fetchJson<Agent[]>("/api/agents"),
      ]);
      return JSON.stringify(teamPerformance(tickets, agents, getRole()));
    },
    {
      name: "team_performance",
      description:
        "Support-team workload: total open tickets, how many are unassigned, and (for managers/admins) the per-rep open-ticket breakdown.",
      schema: z.object({}),
    },
  );

  const health = tool(
    async ({ customer }: { customer: string }) => {
      const customers = await fetchJson<Customer[]>("/api/customers");
      const q = customer.trim().toLowerCase();
      const match = customers.find(
        (c) => c.id.toLowerCase() === q || c.company.toLowerCase().includes(q),
      );
      if (!match) return JSON.stringify({ error: `No customer matching "${customer}".` });
      const tickets = await fetchJson<Ticket[]>(`/api/tickets?customerId=${match.id}`);
      return JSON.stringify(customerHealth(match, tickets, getRole()));
    },
    {
      name: "customer_health",
      description:
        "Account-health summary for one customer (plan, SLA tier, seats, open/at-risk ticket counts). Managers/admins also get the contact's name and email.",
      schema: z.object({
        customer: z.string().describe("Customer company name or id, e.g. 'Acme Robotics' or 'c1'."),
      }),
    },
  );

  return [slaReport, team, health];
}
