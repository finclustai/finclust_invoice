import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney, formatMoneyWithCode, parseMoney } from "./currency";

describe("formatMoney", () => {
  it("uses Indian lakh grouping for INR", () => {
    expect(formatMoney(33868360, "INR")).toBe("₹3,38,683.60");
  });
  it("uses western grouping for USD", () => {
    expect(formatMoney(132600, "USD")).toBe("$1,326.00");
  });
});

describe("formatMoneyWithCode", () => {
  // The PDF uses the standard Helvetica font, whose WinAnsi encoding has no ₹
  // (U+20B9): the symbol would print as an empty box. The original invoices
  // write "INR 3,38,683.60" anyway, so the code is both safe and faithful.
  it("writes the currency code instead of the symbol", () => {
    expect(formatMoneyWithCode(33868360, "INR")).toBe("INR 3,38,683.60");
    expect(formatMoneyWithCode(132600, "USD")).toBe("USD 1,326.00");
  });
  it("never emits a character outside Latin-1", () => {
    for (const s of [formatMoneyWithCode(33868360, "INR"), formatMoneyWithCode(132600, "USD")]) {
      expect(s).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe("formatAmount", () => {
  it("omits the symbol but keeps grouping and 2 decimals", () => {
    expect(formatAmount(33868360, "INR")).toBe("3,38,683.60");
    expect(formatAmount(7500000, "INR")).toBe("75,000.00");
    expect(formatAmount(21100, "USD")).toBe("211.00");
  });
});

describe("parseMoney", () => {
  it.each([
    ["37500", 3750000],
    ["37,500.", 3750000],
    ["25,00.00", 250000],
    ["3,38,683.60", 33868360],
    ["₹ 3,38,683.6", 33868360],
    ["$1,326.00", 132600],
    ["0.29", 29],
    ["  211 ", 21100],
  ])("parses %j", (input, minor) => {
    expect(parseMoney(input)).toBe(minor);
  });

  it.each(["", "abc", "1.234", "-5", "1.2.3", "."])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});
