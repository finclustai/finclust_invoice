import { describe, expect, it } from "vitest";
import { calculateInvoice } from "@/domain/invoice/calculate";
import { draftToRow, rowToDraft, type InvoiceRow } from "./mapping";

const row: InvoiceRow = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "INV2608002",
  state: "ISSUED",
  version: 3,
  companyId: "22222222-2222-4222-8222-222222222222",
  customerId: "33333333-3333-4333-8333-333333333333",
  // Frozen at issue time: the bill-to as printed, not the live customer row.
  customerSnapshot: {
    name: "ALSUM INFOTECH PRIVATE LIMITED",
    addressLines: ["Chennai"],
    gstin: "33AAGCA7303P1ZK",
    stateCode: "33",
    emails: ["hr@alsuminfotech.com"],
  },
  issueDate: new Date("2026-08-01T00:00:00Z"),
  dueDate: null,
  paymentTerms: null,
  currency: "INR",
  template: "classic",
  gstEnabled: true,
  taxRateBp: 1800,
  notes: null,
  lines: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      position: 0,
      description: "Consulting",
      hsnSac: "998314",
      qtyMilli: 1500,
      rateMinor: 7000000n,
      amountMinor: 10500000n,
    },
  ],
};

const ctx = {
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  sellerStateCode: "29",
  placeOfSupplyStateCode: "33",
} as const;

describe("rowToDraft", () => {
  it("converts money and qty into domain units", () => {
    const { draft } = rowToDraft(row);
    expect(draft.lines[0]).toEqual({
      id: row.lines[0]!.id,
      description: "Consulting",
      hsnSac: "998314",
      qty: 1.5,
      rateMinor: 7000000,
    });
  });
  it("renders the date without timezone drift", () => {
    // @db.Date comes back as UTC midnight; a local-time format would show Jul 31.
    expect(rowToDraft(row).draft.issueDate).toBe("2026-08-01");
  });
  it("carries the number, state and version for the header and the version guard", () => {
    expect(rowToDraft(row)).toMatchObject({ number: "INV2608002", state: "ISSUED", version: 3 });
  });
  it("uses the frozen snapshot, so renaming the customer never rewrites a sent invoice", () => {
    expect(rowToDraft(row).draft.customer.name).toBe("ALSUM INFOTECH PRIVATE LIMITED");
  });
});

describe("draftToRow", () => {
  it("writes the totals the calculator produced, never a typed value", () => {
    const { draft } = rowToDraft(row);
    const write = draftToRow(draft, calculateInvoice(draft.lines, ctx));
    expect(write.subtotalMinor).toBe(10500000n);
    expect(write.taxMinor).toBe(1890000n);
    expect(write.totalMinor).toBe(12390000n);
    expect(write.lines[0]).toMatchObject({
      qtyMilli: 1500,
      rateMinor: 7000000n,
      amountMinor: 10500000n,
      position: 0,
    });
  });
  it("writes the seller, so switching company on the invoice takes effect", () => {
    // Left out once, and the company picker silently did nothing: the editor
    // showed the new seller while every save kept the old one.
    const { draft } = rowToDraft(row);
    const moved = { ...draft, companyId: "99999999-9999-4999-8999-999999999999" };
    const write = draftToRow(moved, calculateInvoice(moved.lines, ctx));
    expect(write.companyId).toBe("99999999-9999-4999-8999-999999999999");
  });

  it("round-trips through the database types unchanged", () => {
    const { draft } = rowToDraft(row);
    const write = draftToRow(draft, calculateInvoice(draft.lines, ctx));
    const again = rowToDraft({
      ...row,
      ...write,
      lines: write.lines.map((l, i) => ({ ...l, id: row.lines[i]!.id })),
    } as InvoiceRow);
    expect(again.draft.lines).toEqual(draft.lines);
  });
});
