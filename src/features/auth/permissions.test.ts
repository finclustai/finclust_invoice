import { describe, expect, it } from "vitest";
import { AuthError, authorize, can } from "./permissions";

describe("can", () => {
  it.each([
    ["ADMIN", "admin", true],
    ["ADMIN", "write", true],
    ["ACCOUNTANT", "write", true],
    ["ACCOUNTANT", "send", true],
    ["ACCOUNTANT", "admin", false],
    ["VIEWER", "read", true],
    ["VIEWER", "write", false],
    ["VIEWER", "send", false],
  ] as const)("%s may %s → %s", (role, action, allowed) => {
    expect(can(role, action)).toBe(allowed);
  });
});

describe("authorize: server-side gate for direct action calls", () => {
  it("rejects a missing (logged-out or deactivated) user", () => {
    expect(() => authorize(null, "read")).toThrowError(new AuthError("unauthenticated"));
  });
  it("rejects a VIEWER writing", () => {
    expect(() => authorize({ role: "VIEWER" as const }, "write")).toThrowError(new AuthError("forbidden"));
  });
  it("returns the user when allowed", () => {
    const user = { id: "u", role: "ACCOUNTANT" as const };
    expect(authorize(user, "write")).toBe(user);
  });
});
