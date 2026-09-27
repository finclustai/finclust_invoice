import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./diff";
import type { InvoiceSnapshot } from "./schema";

const snap = (overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot => ({
  number: "INV2608002",
  companyName: "FINCLUST PRIVATE LIMITED",
  companyId: "00000000-0000-4000-8000-000000000001",
  customerId: null,
  customer: { name: "ALSUM", addressLines: ["Chennai"], gstin: null, stateCode: "33", emails: [] },
  issueDate: "2026-08-01",
  dueDate: null,
  paymentTerms: null,
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  template: "classic",
  notes: null,
  lines: [
    { id: "a", description: "Srinivas (August pay-Apex)", hsnSac: null, qty: 1, rateMinor: 7000000 },
    { id: "b", description: "Ramreddy (August pay-OTBI)", hsnSac: null, qty: 1, rateMinor: 7500000 },
  ],
  ...overrides,
});

describe("diffSnapshots", () => {
  it("identical → no changes", () => {
    expect(diffSnapshots(snap(), snap())).toEqual([]);
  });

  it("describes a rate change in the invoice's own money format", () => {
    const after = snap();
    after.lines = [after.lines[0]!, { ...after.lines[1]!, rateMinor: 7000000 }];
    expect(diffSnapshots(snap(), after)).toEqual([
      { label: "Line 2 rate", from: "75,000.00", to: "70,000.00" },
    ]);
  });

  it("describes added and removed lines", () => {
    const after = snap({
      lines: [
        snap().lines[1]!,
        { id: "c", description: "Vamshi -OIC", hsnSac: null, qty: 1, rateMinor: 3839000 },
      ],
    });
    expect(diffSnapshots(snap(), after)).toEqual([
      { label: "Line 2 added", from: "", to: "Vamshi -OIC · 1 × 38,390.00" },
      { label: "Line 1 removed", from: "Srinivas (August pay-Apex) · 1 × 70,000.00", to: "" },
    ]);
  });

  it("describes header field changes", () => {
    const after = snap({ issueDate: "2026-08-02", gstEnabled: false, companyName: "Other Co" });
    expect(diffSnapshots(snap(), after)).toEqual([
      { label: "Seller", from: "FINCLUST PRIVATE LIMITED", to: "Other Co" },
      { label: "Invoice date", from: "2026-08-01", to: "2026-08-02" },
      { label: "GST", from: "On @ 18%", to: "Off" },
    ]);
  });
});
