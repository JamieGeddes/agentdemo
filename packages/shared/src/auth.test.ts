import { describe, expect, it } from "vitest";
import { isUserRole, roleAtLeast } from "./guards.js";
import { DEMO_PASSWORD, findUserByLogin, seedUsers } from "./seed.js";
import { decodeToken, mintToken } from "./token.js";

describe("demo users", () => {
  it("has one user per role with unique usernames/ids", () => {
    expect(seedUsers.map((u) => u.role).sort()).toEqual(["admin", "manager", "readonly"]);
    expect(new Set(seedUsers.map((u) => u.username)).size).toBe(seedUsers.length);
    expect(new Set(seedUsers.map((u) => u.id)).size).toBe(seedUsers.length);
  });

  it("authenticates a correct username/password", () => {
    const u = findUserByLogin("admin", DEMO_PASSWORD);
    expect(u?.role).toBe("admin");
  });

  it("rejects a wrong password or unknown user", () => {
    expect(findUserByLogin("admin", "nope")).toBeUndefined();
    expect(findUserByLogin("ghost", DEMO_PASSWORD)).toBeUndefined();
  });
});

describe("roleAtLeast", () => {
  it("respects readonly < manager < admin", () => {
    expect(roleAtLeast("admin", "manager")).toBe(true);
    expect(roleAtLeast("manager", "manager")).toBe(true);
    expect(roleAtLeast("manager", "admin")).toBe(false);
    expect(roleAtLeast("readonly", "manager")).toBe(false);
  });

  it("isUserRole guards unknown strings", () => {
    expect(isUserRole("admin")).toBe(true);
    expect(isUserRole("superuser")).toBe(false);
    expect(isUserRole(7)).toBe(false);
  });
});

describe("bearer token (simulated A2A credential)", () => {
  it("round-trips identity through mint → decode", () => {
    const user = { id: "u1", name: "Dana Admin", role: "admin" as const };
    const token = mintToken(user);
    expect(decodeToken(token)).toEqual({ userId: "u1", userName: "Dana Admin", role: "admin" });
  });

  it("accepts an Authorization header value", () => {
    const token = mintToken({ id: "u2", name: "Morgan Manager", role: "manager" });
    expect(decodeToken(`Bearer ${token}`)?.role).toBe("manager");
  });

  it("returns null for malformed, empty, or unknown-role tokens", () => {
    expect(decodeToken(undefined)).toBeNull();
    expect(decodeToken("")).toBeNull();
    expect(decodeToken("not-a-token")).toBeNull();
    const badRole = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: "x", name: "X", role: "root" }),
    ).toString("base64url")}.demo`;
    expect(decodeToken(badRole)).toBeNull();
  });
});
