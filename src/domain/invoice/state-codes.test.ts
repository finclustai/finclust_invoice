import { describe, expect, it } from "vitest";
import { GST_STATES, isValidStateCode, stateName } from "./state-codes";

describe("GST_STATES", () => {
  it("knows the two states on the sample invoices", () => {
    expect(stateName("29")).toBe("Karnataka");
    expect(stateName("33")).toBe("Tamil Nadu");
  });

  it("is ordered by code and has no duplicates", () => {
    const codes = GST_STATES.map((s) => s.code);
    expect(codes).toEqual([...codes].sort());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses two digits throughout, which is what a GSTIN carries", () => {
    for (const s of GST_STATES) expect(s.code).toMatch(/^\d{2}$/);
  });
});

describe("isValidStateCode", () => {
  it.each(["01", "29", "33", "38", "97", "99"])("accepts the real code %s", (code) => {
    expect(isValidStateCode(code)).toBe(true);
  });

  // "00" and "40" are two digits but no state: the old check let them through
  // and the tax regime was then computed against a place that does not exist.
  it.each(["00", "39", "40", "9", "290", "", "ka"])("rejects %j", (code) => {
    expect(isValidStateCode(code)).toBe(false);
  });
});

describe("stateName", () => {
  it("returns null for a code that is not a state", () => {
    expect(stateName("00")).toBeNull();
  });
});
