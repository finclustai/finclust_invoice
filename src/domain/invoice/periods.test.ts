import { describe, expect, it } from "vitest";
import { recentPeriods } from "./periods";

describe("recentPeriods", () => {
  it("returns twelve months, oldest first, ending with today's", () => {
    const periods = recentPeriods("2026-09-27");
    expect(periods).toHaveLength(12);
    expect(periods.at(-1)).toBe("2609");
    expect(periods[0]).toBe("2510");
  });

  it("walks back across a year boundary", () => {
    // The case that breaks naive month arithmetic: January minus one month.
    const periods = recentPeriods("2026-01-15");
    expect(periods.at(-1)).toBe("2601");
    expect(periods.at(-2)).toBe("2512");
    expect(periods[0]).toBe("2502");
  });

  it("handles December without rolling into the next year", () => {
    const periods = recentPeriods("2026-12-31");
    expect(periods.at(-1)).toBe("2612");
    expect(periods[0]).toBe("2601");
  });

  it("crosses a century boundary without producing a negative year", () => {
    const periods = recentPeriods("2100-02-01");
    expect(periods.at(-1)).toBe("0002");
    expect(periods[0]).toBe("9903");
  });

  it("never repeats a month", () => {
    for (const today of ["2026-01-15", "2026-06-30", "2026-12-01"]) {
      const periods = recentPeriods(today);
      expect(new Set(periods).size).toBe(12);
    }
  });

  it("only ever produces valid month numbers", () => {
    for (const p of recentPeriods("2026-01-15")) {
      const month = Number(p.slice(2));
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });
});
