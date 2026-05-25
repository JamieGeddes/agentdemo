/**
 * Seed internal runbooks — the kind of *internal* product/operational knowledge
 * the public DeepWiki (OSS-repo) knowledge base can't answer. Keyed to the demo
 * tickets so "resolve T-1004" can cite a real internal procedure. Deterministic,
 * in-memory, no external dependency.
 */

export interface Runbook {
  id: string;
  title: string;
  category: "webhooks" | "billing" | "security" | "auth";
  /** Lowercased keywords matched by search_runbooks. */
  keywords: string[];
  body: string;
}

export const RUNBOOKS: Runbook[] = [
  {
    id: "rb-webhook-hmac",
    title: "Webhook deliveries failing with 401 / HMAC signature mismatch",
    category: "webhooks",
    keywords: ["webhook", "401", "hmac", "signature", "signing secret", "delivery", "unauthorized"],
    body: [
      "Symptom: webhook deliveries start returning 401 and the receiver reports the HMAC signature no longer matches.",
      "",
      "Root cause: the signing secret was rotated on our platform (automatic 90-day rotation, or a manual rotation in the dashboard). The old secret stops signing new deliveries, so receivers still verifying with the old secret reject them.",
      "",
      "Resolution steps:",
      "1. In Dashboard → Webhooks → Endpoint → Signing secrets, confirm whether a rotation occurred (check the 'last rotated' timestamp).",
      "2. Both the previous and current secret remain valid for a 24h overlap window. Copy the CURRENT secret.",
      "3. Update the secret in the customer's webhook verification config and redeploy.",
      "4. Ask the customer to verify against BOTH secrets during the overlap window to avoid dropped events.",
      "5. Replay any failed deliveries from Dashboard → Webhooks → Failed deliveries → Replay.",
      "",
      "Prevention: subscribe to the `webhook.secret.rotated` event and pull the new secret automatically.",
    ].join("\n"),
  },
  {
    id: "rb-seat-billing",
    title: "Invoice shows an incorrect seat count",
    category: "billing",
    keywords: ["billing", "invoice", "seat", "seats", "seat count", "deactivated", "users", "overcharged"],
    body: [
      "Symptom: a customer is billed for more seats than they have active users.",
      "",
      "Root cause: seat counts are measured at the START of each billing cycle (the 1st, 00:00 UTC). Users deactivated mid-cycle are NOT pro-rated automatically on the current invoice — the reduction applies to the NEXT cycle.",
      "",
      "Resolution steps:",
      "1. In Admin → Billing → Seat history, read the seat count snapshot at the cycle start date.",
      "2. Confirm when the disputed users were deactivated. If they were active at the snapshot, the charge is correct for THIS cycle.",
      "3. If a customer deactivated users before the snapshot but was still charged, raise a billing adjustment: Admin → Billing → Adjustments → Credit, citing the seat-history snapshot.",
      "4. Confirm the reduced seat count will apply to the next cycle.",
      "",
      "Note: enterprise contracts may have a committed seat minimum — check the contract before issuing credit.",
    ].join("\n"),
  },
  {
    id: "rb-api-key-rotation",
    title: "Rotating API keys without downtime (dual-key rollover)",
    category: "security",
    keywords: ["api key", "api-keys", "rotate", "rotation", "rollover", "downtime", "overlapping keys"],
    body: [
      "Goal: rotate an integration's API key with zero downtime.",
      "",
      "Capability: an account may hold up to 5 active API keys simultaneously, which makes overlapping rollover possible.",
      "",
      "Dual-key rollover steps:",
      "1. Dashboard → API keys → Create key. Label it with the date, e.g. 'prod-2026-05'.",
      "2. Deploy the new key to all services (env vars / secret manager). Do NOT revoke the old key yet.",
      "3. Verify traffic is flowing on the new key: Dashboard → API keys → select key → Last used.",
      "4. Once the new key shows recent usage from every service and the old key shows none for 24h, revoke the old key.",
      "5. Schedule the revoke inside a maintenance window so you can roll back instantly if a service was missed.",
      "",
      "Tip: tag keys per-service to make 'last used' diagnosis unambiguous.",
    ].join("\n"),
  },
];

/** Keyword search over the runbooks; returns compact stubs. */
export function searchRunbooks(query: string, category?: string): Array<Pick<Runbook, "id" | "title" | "category">> {
  const q = query.toLowerCase();
  return RUNBOOKS.filter((rb) => {
    if (category && rb.category !== category) return false;
    return (
      rb.title.toLowerCase().includes(q) ||
      rb.keywords.some((k) => q.includes(k) || k.includes(q)) ||
      q.split(/\s+/).some((w) => w.length > 3 && rb.keywords.some((k) => k.includes(w)))
    );
  }).map((rb) => ({ id: rb.id, title: rb.title, category: rb.category }));
}

export function readRunbook(id: string): Runbook | undefined {
  return RUNBOOKS.find((rb) => rb.id === id);
}
