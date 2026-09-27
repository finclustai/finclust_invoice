import { describe, expect, it } from "vitest";
import { calculateInvoice, lineAmount, taxRegime, type TaxContext } from "./calculate";

const KA = "29"; // FINCLUST, Karnataka
const inr = (overrides: Partial<TaxContext> = {}): TaxContext => ({
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  sellerStateCode: KA,
  placeOfSupplyStateCode: "33",
  ...overrides,
});
const line = (rupees: number, qty = 1) => ({ description: "x", qty, rateMinor: rupees * 100 });

describe("calculateInvoice: the real sample invoices", () => {
  it("INV2608002 (ALSUM, Tamil Nadu): IGST 18%, matching the balance on the Google Doc", () => {
    const result = calculateInvoice(
      [37500, 25000, 70000, 75000, 41130, 38390].map((r) => line(r)),
      inr({ placeOfSupplyStateCode: "33" }),
    );
    expect(result.subtotalMinor).toBe(28702000);
    expect(result.regime).toBe("inter");
    expect(result.taxes).toEqual([{ label: "IGST", rateBp: 1800, amountMinor: 5166360 }]);
    expect(result.totalMinor).toBe(33868360);
    expect(result.totalInWords).toBe(
      "Rupees Three Lakh Thirty Eight Thousand Six Hundred Eighty Three and Sixty Paise Only",
    );
  });

  it("INV2608001 (Technophile, USA): export under LUT, no tax", () => {
    const result = calculateInvoice([line(211), line(315), line(800)], {
      currency: "USD",
      gstEnabled: true,
      taxRateBp: 1800,
      sellerStateCode: KA,
      placeOfSupplyStateCode: null,
    });
    expect(result.regime).toBe("export");
    expect(result.taxes).toEqual([]);
    expect(result.totalMinor).toBe(132600);
  });
});

describe("tax regime", () => {
  it("same state → CGST + SGST at half rate each", () => {
    const result = calculateInvoice([line(1000)], inr({ placeOfSupplyStateCode: KA }));
    expect(result.taxes).toEqual([
      { label: "CGST", rateBp: 900, amountMinor: 9000 },
      { label: "SGST", rateBp: 900, amountMinor: 9000 },
    ]);
    expect(result.totalMinor).toBe(118000);
  });

  it("unregistered Indian customer still follows place of supply", () => {
    // No GSTIN is involved at all: only the state code matters.
    expect(taxRegime(inr({ placeOfSupplyStateCode: "27" }))).toBe("inter");
  });

  it("GST switched off → none", () => {
    const result = calculateInvoice([line(1000)], inr({ gstEnabled: false }));
    expect(result.regime).toBe("none");
    expect(result.totalMinor).toBe(100000);
  });

  it("export wins even if GST is on", () => {
    expect(taxRegime(inr({ placeOfSupplyStateCode: null }))).toBe("export");
  });

  it("respects a custom rate", () => {
    const result = calculateInvoice([line(1000)], inr({ taxRateBp: 500 }));
    expect(result.taxes).toEqual([{ label: "IGST", rateBp: 500, amountMinor: 5000 }]);
  });
});

describe("rounding", () => {
  it("rounds each line once, half away from zero", () => {
    expect(lineAmount(1.5, 33333)).toBe(50000); // 49999.5 → 50000
    expect(lineAmount(0.1, 30000)).toBe(3000); // no float drift
    expect(lineAmount(2.345, 100)).toBe(235); // 234.5 → 235
  });

  it("empty invoice totals zero", () => {
    const result = calculateInvoice([], inr());
    expect(result.totalMinor).toBe(0);
    expect(result.totalInWords).toBe("Rupees Zero Only");
  });

  it("keeps extra line fields (ids) on the output", () => {
    const result = calculateInvoice([{ id: "a", description: "x", qty: 2, rateMinor: 150 }], inr());
    expect(result.lines[0]).toMatchObject({ id: "a", amountMinor: 300 });
  });
});
