import { AsyncLocalStorage } from "node:async_hooks";
import type { CallerIdentity } from "@agentdemo/shared";

/**
 * The shared context arrives as an `Authorization: Bearer <token>` header (A2A's
 * standard credential channel). Because the A2A `ServerCallContext` only surfaces
 * a minimal `userName`, the Fastify route decodes the full caller identity itself
 * and runs the request handler inside `runWithCaller`, so the executor and tools —
 * which never see the raw request — can read the caller from this
 * AsyncLocalStorage while authorizing each action.
 */
const callerStore = new AsyncLocalStorage<CallerIdentity | null>();

/** Run `fn` (and everything it awaits) with `caller` as the in-context caller. */
export function runWithCaller<T>(caller: CallerIdentity | null, fn: () => T): T {
  return callerStore.run(caller, fn);
}

/** The caller for the in-flight request (null when unauthenticated). */
export function getCaller(): CallerIdentity | null {
  return callerStore.getStore() ?? null;
}

/** Least-privilege default: an unauthenticated caller is treated as readonly. */
export function getRole(): CallerIdentity["role"] {
  return getCaller()?.role ?? "readonly";
}
