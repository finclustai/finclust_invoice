import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ORIGINAL = { ...process.env };
const STRONG = "x".repeat(32);

beforeEach(() => {
  process.env.JWT_SECRET = STRONG;
  delete process.env.SESSION_TTL_HOURS;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

async function load() {
  const { env } = await import("./env");
  return env;
}

describe("jwtSecret", () => {
  it("returns a strong secret", async () => {
    expect((await load()).jwtSecret).toBe(STRONG);
  });

  it("refuses to boot without one", async () => {
    delete process.env.JWT_SECRET;
    await expect(async () => (await load()).jwtSecret).rejects.toThrow(/JWT_SECRET/);
  });

  it("refuses a secret short enough to brute-force from a captured cookie", async () => {
    // HS256 over "secret" is offline-crackable; a forged {sub: adminId} is then ADMIN.
    process.env.JWT_SECRET = "secret";
    await expect(async () => (await load()).jwtSecret).rejects.toThrow(/32/);
  });
});

describe("sessionTtlHours", () => {
  it("defaults to 12", async () => {
    expect((await load()).sessionTtlHours).toBe(12);
  });

  it("reads a valid override", async () => {
    process.env.SESSION_TTL_HOURS = "4";
    expect((await load()).sessionTtlHours).toBe(4);
  });

  it("treats an empty value as unset", async () => {
    process.env.SESSION_TTL_HOURS = "";
    expect((await load()).sessionTtlHours).toBe(12);
  });

  it.each(["twelve", "0", "-3"])("rejects %j instead of silently becoming NaN", async (raw) => {
    // NaN here makes every issued token unverifiable and maxAge throw: nobody
    // can log in, with nothing pointing at the cause.
    process.env.SESSION_TTL_HOURS = raw;
    await expect(async () => (await load()).sessionTtlHours).rejects.toThrow(/SESSION_TTL_HOURS/);
  });
});
