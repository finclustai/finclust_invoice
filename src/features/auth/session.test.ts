import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

const SECRET = "test-secret-that-is-at-least-32-chars!!";

describe("session", () => {
  it("round-trips the user id", async () => {
    const token = await signSession({ userId: "u1" }, SECRET, 1);
    expect(await verifySession(token, SECRET)).toEqual({ userId: "u1" });
  });
  it("rejects a token signed with another secret", async () => {
    const token = await signSession({ userId: "u1" }, "another-secret-that-is-32-chars-long!", 1);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
  it("rejects an expired token", async () => {
    const token = await signSession({ userId: "u1" }, SECRET, -1);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
  it("rejects garbage", async () => {
    expect(await verifySession("not-a-jwt", SECRET)).toBeNull();
  });
});
