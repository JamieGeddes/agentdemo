import { useState, type FormEvent, type ReactNode } from "react";
import { DEMO_PASSWORD } from "@agentdemo/shared";
import { useAuth } from "../state/AuthProvider.js";

/**
 * Gates the whole app behind a sign-in. The three demo users (admin / manager /
 * readonly) have different access levels, which the A2A subagents enforce — so
 * which login you pick changes what Aria's subagents will let you do.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { session, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch {
      setError("Invalid username or password.");
      setBusy(false);
    }
  };

  const fill = (name: string) => {
    setUsername(name);
    setPassword(DEMO_PASSWORD);
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__brand">Vela</div>
        <h1 className="login__title">Sign in to the support desk</h1>
        <label className="login__field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label className="login__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="login__error">{error}</p>}
        <button className="login__submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="login__hint">
          Demo users (password <b>{DEMO_PASSWORD}</b>):{" "}
          {["admin", "manager", "readonly"].map((u) => (
            <button type="button" key={u} className="login__demo" onClick={() => fill(u)}>
              {u}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
