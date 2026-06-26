import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthSession } from "@agentdemo/shared";
import { api, setAuthToken } from "../api.js";

/**
 * Holds the logged-in session (user + simulated bearer token). The token is the
 * shared credential the agent forwards to the A2A subagents, so the session is
 * also handed to the CopilotKit provider (see App.tsx) as structured `properties`
 * — never through the chat/LLM. Persisted to localStorage so a refresh keeps you
 * signed in; the "Reset demo" reload is unaffected.
 */
const STORAGE_KEY = "vela.auth";

interface AuthContextValue {
  session: AuthSession | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function loadStored(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    setAuthToken(parsed.token);
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadStored);

  const login = useCallback(async (username: string, password: string) => {
    const next = await api.login(username, password);
    setAuthToken(next.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
