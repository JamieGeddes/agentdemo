import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthProvider.js";
import { LoginGate } from "../components/LoginGate.js";

const session = {
  user: { id: "u1", name: "Dana Admin", username: "admin", role: "admin" },
  token: "tok-xyz",
};

function loginFetch(ok = true) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/login" && init?.method === "POST") {
      return ok
        ? new Response(JSON.stringify(session), { status: 200 })
        : new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

function Protected() {
  const { session: s, logout } = useAuth();
  return (
    <div>
      <span data-testid="who">{s?.user.name}</span>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <LoginGate>
        <Protected />
      </LoginGate>
    </AuthProvider>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("AuthProvider + LoginGate", () => {
  it("gates the app behind the login form", () => {
    vi.stubGlobal("fetch", loginFetch());
    render(<App />);
    expect(screen.getByText("Sign in to the support desk")).toBeInTheDocument();
    expect(screen.queryByTestId("who")).toBeNull();
  });

  it("signs in, renders the app, and persists the session", async () => {
    vi.stubGlobal("fetch", loginFetch());
    render(<App />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("Dana Admin"));
    expect(JSON.parse(localStorage.getItem("vela.auth")!).token).toBe("tok-xyz");
  });

  it("shows an error on bad credentials and stays gated", async () => {
    vi.stubGlobal("fetch", loginFetch(false));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("Invalid username or password.")).toBeInTheDocument());
    expect(screen.queryByTestId("who")).toBeNull();
  });

  it("hydrates an existing session from localStorage", () => {
    localStorage.setItem("vela.auth", JSON.stringify(session));
    vi.stubGlobal("fetch", loginFetch());
    render(<App />);
    expect(screen.getByTestId("who").textContent).toBe("Dana Admin");
  });
});
