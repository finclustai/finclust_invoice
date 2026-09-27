import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, periodOf } from "./numbering";

describe("numbering", () => {
  it("period is YYMM of the invoice date", () => {
    expect(periodOf("2026-08-01")).toBe("2608");
    expect(periodOf("2026-09-30")).toBe("2609");
  });
  it("formats with a 3-digit counter", () => {
    expect(formatInvoiceNumber("2608", 2)).toBe("INV2608002");
    expect(formatInvoiceNumber("2609", 1)).toBe("INV2609001");
    expect(formatInvoiceNumber("2609", 1000)).toBe("INV26091000");
  });
  it("rejects malformed input", () => {
    expect(() => periodOf("01/08/2026")).toThrow();
    expect(() => formatInvoiceNumber("2608", 0)).toThrow();
  });
});
