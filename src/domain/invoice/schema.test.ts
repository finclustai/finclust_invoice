import { describe, expect, it } from "vitest";
import {
  GSTIN_PATTERN,
  invoiceDraftSchema,
  stateCodeFromGstin,
  validateForIssue,
  type InvoiceDraft,
} from "./schema";

export const draft = (overrides: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  companyId: "00000000-0000-4000-8000-000000000001",
  customerId: null,
  customer: {
    name: "ALSUM INFOTECH PRIVATE LIMITED",
    addressLines: ["Chennai"],
    gstin: "33AAGCA7303P1ZK",
    stateCode: "33",
    emails: [],
  },
  issueDate: "2026-09-01",
  dueDate: "2026-09-15",
  paymentTerms: null,
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  template: "classic",
  notes: null,
  lines: [{ id: "l1", description: "Consulting", hsnSac: "998314", qty: 1, rateMinor: 100000 }],
  ...overrides,
});

describe("GSTIN", () => {
  it("accepts the real GSTINs from the samples", () => {
    expect(GSTIN_PATTERN.test("29AAGCF2643D1ZS")).toBe(true);
    expect(GSTIN_PATTERN.test("33AAGCA7303P1ZK")).toBe(true);
    expect(GSTIN_PATTERN.test("29AAGCF2643D1Z")).toBe(false);
  });
  it("reads the state code", () => {
    expect(stateCodeFromGstin("33AAGCA7303P1ZK")).toBe("33");
  });
});

describe("invoiceDraftSchema", () => {
  it("accepts a valid draft", () => {
    expect(invoiceDraftSchema.safeParse(draft()).success).toBe(true);
  });
  it("allows half-filled lines while drafting (autosave must never fail)", () => {
    const d = draft({ lines: [{ id: "l1", description: "", hsnSac: null, qty: 0, rateMinor: 0 }] });
    expect(invoiceDraftSchema.safeParse(d).success).toBe(true);
  });
  it("rejects more than 3 decimals of qty, fractional minor units, and due before issue", () => {
    expect(
      invoiceDraftSchema.safeParse(
        draft({ lines: [{ id: "l", description: "x", hsnSac: null, qty: 1.2345, rateMinor: 1 }] }),
      ).success,
    ).toBe(false);
    expect(
      invoiceDraftSchema.safeParse(
        draft({ lines: [{ id: "l", description: "x", hsnSac: null, qty: 1, rateMinor: 1.5 }] }),
      ).success,
    ).toBe(false);
    expect(invoiceDraftSchema.safeParse(draft({ dueDate: "2026-08-01" })).success).toBe(false);
  });
  it("rejects a malformed GSTIN", () => {
    const d = draft({ customer: { ...draft().customer, gstin: "BAD" } });
    expect(invoiceDraftSchema.safeParse(d).success).toBe(false);
  });

  it("rejects a place of supply that contradicts the GSTIN", () => {
    // 33… is Tamil Nadu; claiming Karnataka would charge CGST+SGST against a
    // Karnataka seller on a supply that is actually inter-state.
    const d = draft({ customer: { ...draft().customer, gstin: "33AAGCA7303P1ZK", stateCode: "29" } });
    expect(invoiceDraftSchema.safeParse(d).success).toBe(false);
  });

  it("rejects a GSTIN with no place of supply at all", () => {
    const d = draft({ customer: { ...draft().customer, gstin: "33AAGCA7303P1ZK", stateCode: null } });
    expect(invoiceDraftSchema.safeParse(d).success).toBe(false);
  });

  it("still allows an unregistered Indian customer (state, no GSTIN)", () => {
    const d = draft({ customer: { ...draft().customer, gstin: null, stateCode: "27" } });
    expect(invoiceDraftSchema.safeParse(d).success).toBe(true);
  });
});

describe("validateForIssue", () => {
  it("passes a complete invoice", () => {
    expect(validateForIssue(draft())).toEqual([]);
  });
  it("lists every problem with its line number", () => {
    const problems = validateForIssue(
      draft({
        customer: { ...draft().customer, name: " " },
        lines: [
          { id: "a", description: "ok", hsnSac: null, qty: 1, rateMinor: 100 },
          { id: "b", description: "", hsnSac: null, qty: 0, rateMinor: 100 },
        ],
      }),
    );
    expect(problems).toEqual([
      "Choose a customer",
      "Line 2: add a description",
      "Line 2: quantity must be more than 0",
    ]);
  });
  it("requires at least one line", () => {
    expect(validateForIssue(draft({ lines: [] }))).toEqual([
      "Add at least one line item",
      "The invoice total is zero — enter an amount",
    ]);
  });

  it("refuses to issue an invoice worth nothing", () => {
    // Tabbing past the rate column must not burn a number from the GST series.
    const problems = validateForIssue(
      draft({ lines: [{ id: "a", description: "Consulting", hsnSac: null, qty: 1, rateMinor: 0 }] }),
    );
    expect(problems).toEqual(["The invoice total is zero — enter an amount"]);
  });

  it("refuses to issue a GST invoice with no place of supply", () => {
    // Without a state code the regime silently falls back to export and drops 18%.
    const problems = validateForIssue(draft({ customer: { ...draft().customer, gstin: null, stateCode: null } }));
    expect(problems).toEqual(["Set the customer's state (place of supply) before issuing"]);
  });

  it("does not demand a place of supply on an export invoice", () => {
    const problems = validateForIssue(
      draft({ currency: "USD", customer: { ...draft().customer, gstin: null, stateCode: null } }),
    );
    expect(problems).toEqual([]);
  });
});
