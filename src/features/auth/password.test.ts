import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { verifyCredentials, type AuthUserRecord } from "./password";

const hash = bcrypt.hashSync("right-password", 4);
const users: Record<string, AuthUserRecord> = {
  "a@x.com": { id: "1", email: "a@x.com", name: "A", role: "ACCOUNTANT", passwordHash: hash, isActive: true },
  "off@x.com": { id: "2", email: "off@x.com", name: "Off", role: "ADMIN", passwordHash: hash, isActive: false },
};
const find = async (email: string) => users[email] ?? null;

describe("verifyCredentials", () => {
  it("accepts the right password", async () => {
    expect((await verifyCredentials(find, "a@x.com", "right-password"))?.id).toBe("1");
  });
  it("rejects a wrong password", async () => {
    expect(await verifyCredentials(find, "a@x.com", "nope")).toBeNull();
  });
  it("rejects an unknown email", async () => {
    expect(await verifyCredentials(find, "who@x.com", "right-password")).toBeNull();
  });
  it("rejects a deactivated account even with the right password", async () => {
    expect(await verifyCredentials(find, "off@x.com", "right-password")).toBeNull();
  });
});
