import { isUserRole } from "./guards.js";
import type { CallerIdentity, User } from "./types.js";

/**
 * The simulated bearer credential that carries the shared context between agents.
 *
 * It is JWT-shaped (`header.payload.signature`) but **unsigned** — the signature
 * segment is a fixed placeholder and is never verified. The payload carries the
 * caller's identity so a remote subagent can recover `{ userId, userName, role }`
 * by decoding it. This is exactly the A2A bearer-auth model (credentials in the
 * `Authorization` header, separate from the message); we keep it deliberately
 * trivial because the token is a demo stand-in, not a real access token.
 */
interface TokenPayload {
  sub: string; // userId
  name: string; // userName
  role: string;
}

const b64url = (s: string): string => Buffer.from(s, "utf8").toString("base64url");
const unb64url = (s: string): string => Buffer.from(s, "base64url").toString("utf8");

/** Mint a token for the given user. Issued by the server on login. */
export function mintToken(user: Pick<User, "id" | "name" | "role">): string {
  const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: user.id, name: user.name, role: user.role } satisfies TokenPayload),
  );
  return `${header}.${payload}.demo`;
}

/**
 * Decode a token minted by {@link mintToken} back into the caller identity.
 * Accepts a raw token or an `Authorization: Bearer <token>` header value.
 * Returns `null` for anything malformed or carrying an unknown role — callers
 * treat `null` as "unauthenticated". No signature check (the token is simulated).
 */
export function decodeToken(token: string | undefined | null): CallerIdentity | null {
  if (!token) return null;
  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(unb64url(parts[1])) as Partial<TokenPayload>;
    if (
      !payload ||
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      !isUserRole(payload.role)
    ) {
      return null;
    }
    return { userId: payload.sub, userName: payload.name, role: payload.role };
  } catch {
    return null;
  }
}
