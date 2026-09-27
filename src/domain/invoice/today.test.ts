import { describe, expect, it } from "vitest";
import { businessDay } from "./today";

describe("businessDay", () => {
  it("is the Indian calendar day, not the UTC one", () => {
    // 01:00 IST on 16 Sep is still 19:30 UTC on the 15th. Using the UTC day
    // would call an invoice due on the 15th 'Sent' until 05:30 IST.
    expect(businessDay(new Date("2026-09-15T19:30:00Z"))).toBe("2026-09-16");
  });
  it("agrees with UTC during Indian working hours", () => {
    expect(businessDay(new Date("2026-09-15T09:00:00Z"))).toBe("2026-09-15");
  });
  it("rolls over exactly at midnight IST", () => {
    expect(businessDay(new Date("2026-09-15T18:29:59Z"))).toBe("2026-09-15");
    expect(businessDay(new Date("2026-09-15T18:30:00Z"))).toBe("2026-09-16");
  });
});
