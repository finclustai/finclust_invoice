import { describe, expect, it } from "vitest";
import { fromMinor, fromQtyMilli, toMinor, toQtyMilli } from "./bigint";

describe("fromMinor", () => {
  it("converts a BigInt column to a domain number", () => {
    expect(fromMinor(33868360n)).toBe(33868360);
    expect(fromMinor(0n)).toBe(0);
  });
  it("throws rather than silently losing precision past 2^53", () => {
    // Number(9007199254740993n) is 9007199254740992 — a wrong amount, silently.
    expect(() => fromMinor(9007199254740993n)).toThrow(/safe integer/i);
  });
});

describe("toMinor", () => {
  it("converts a domain number to a BigInt column", () => {
    expect(toMinor(33868360)).toBe(33868360n);
  });
  it.each([1.5, NaN, Infinity])("throws on %p: money is never fractional minor units", (v) => {
    expect(() => toMinor(v)).toThrow(/whole number/i);
  });
});

describe("qty milli", () => {
  it("round-trips 3 decimals exactly", () => {
    for (const q of [1, 1.5, 0.333, 2.345, 1000]) expect(fromQtyMilli(toQtyMilli(q))).toBe(q);
  });
  it("scales without float drift", () => {
    expect(toQtyMilli(0.1)).toBe(100); // not 100.00000000000001
    expect(toQtyMilli(2.345)).toBe(2345);
  });
  it("throws past 3 decimals rather than rounding silently", () => {
    expect(() => toQtyMilli(1.2345)).toThrow(/3 decimals/i);
  });
});
