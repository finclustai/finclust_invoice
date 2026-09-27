import { describe, expect, it } from "vitest";
import { buildSummaryCsv, type SummaryRow } from "./summary-csv";

const row = (over: Partial<SummaryRow> = {}): SummaryRow => ({
  number: "INV2608002",
  issueDate: "2026-08-01",
  customerName: "ALSUM INFOTECH PRIVATE LIMITED",
  customerGstin: "33AAGCA7303P1ZK",
  placeOfSupply: "33",
  currency: "INR",
  taxableMinor: 28702000,
  cgstMinor: 0,
  sgstMinor: 0,
  igstMinor: 5166360,
  totalMinor: 33868360,
  paidMinor: 0,
  status: "sent",
  ...over,
});

const parse = (csv: string) => csv.trim().split("\n").map((l) => l.split(","));

describe("buildSummaryCsv", () => {
  it("names every column a CA needs to file", () => {
    const [header] = parse(buildSummaryCsv([row()]));
    expect(header).toEqual([
      "Invoice",
      "Date",
      "Customer",
      "GSTIN",
      "Place of supply",
      "Currency",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
      "Total",
      "Paid",
      "Status",
    ]);
  });

  it("writes plain decimal amounts, not grouped ones", () => {
    // A spreadsheet has to read these as numbers: "3,38,683.60" would land in
    // the wrong column and then not add up.
    const [, values] = parse(buildSummaryCsv([row()]));
    expect(values).toContain("287020.00");
    expect(values).toContain("338683.60");
    expect(values).not.toContain("3,38,683.60");
  });

  it("quotes a customer name containing a comma", () => {
    const csv = buildSummaryCsv([row({ customerName: "Acme, Inc." })]);
    expect(csv).toContain('"Acme, Inc."');
    expect(parse(csv)[1]).toHaveLength(13 + 1); // the naive split sees the quoted comma
  });

  it("escapes a quote inside a field", () => {
    expect(buildSummaryCsv([row({ customerName: 'The "Big" Co' })])).toContain('"The ""Big"" Co"');
  });

  it("splits CGST and SGST for a same-state sale", () => {
    const csv = buildSummaryCsv([row({ cgstMinor: 2583180, sgstMinor: 2583180, igstMinor: 0 })]);
    const values = parse(csv)[1]!;
    // Columns 7 and 8 are CGST and SGST; IGST (column 9) must be zero.
    expect(values[7]).toBe("25831.80");
    expect(values[8]).toBe("25831.80");
    expect(values[9]).toBe("0.00");
  });

  it("totals every row at the bottom, which is the number that gets checked", () => {
    const csv = buildSummaryCsv([row(), row({ number: "INV2608003" })]);
    const last = parse(csv).at(-1)!;
    expect(last[0]).toBe("Total");
    expect(last).toContain("677367.20"); // 338683.60 x 2
  });

  it("keeps currencies apart rather than adding rupees to dollars", () => {
    const csv = buildSummaryCsv([row(), row({ number: "INV2608001", currency: "USD", totalMinor: 132600, taxableMinor: 132600, igstMinor: 0 })]);
    expect(csv).toContain("INR subtotal");
    expect(csv).toContain("USD subtotal");
  });

  it.each(["=cmd|calc!A1", "+1+1", "-2+3", "@SUM(A1)", "\treboot"])(
    "defuses %j, which Excel would otherwise run as a formula",
    (name) => {
      // The spreadsheet is emailed to an accountant and opened in Excel. A
      // customer name beginning = + - @ or tab is a formula there, not text.
      const cell = parse(buildSummaryCsv([row({ customerName: name })]))[1]![2]!;
      expect(cell.replace(/^"/, "")).toMatch(/^'/);
    },
  );

  it("leaves an ordinary name untouched", () => {
    const cell = parse(buildSummaryCsv([row({ customerName: "ALSUM INFOTECH PRIVATE LIMITED" })]))[1]![2]!;
    expect(cell).toBe("ALSUM INFOTECH PRIVATE LIMITED");
  });

  it("handles a month with no invoices", () => {
    expect(buildSummaryCsv([])).toContain("Invoice,Date,Customer");
  });
});
