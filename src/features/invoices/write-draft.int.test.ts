import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { InvoiceDraft } from "@/domain/invoice/schema";
import { writeDraft } from "./write-draft";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("writeDraft (needs TEST_DATABASE_URL)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  let companyId = "";
  let invoiceId = "";

  const draft = (overrides: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
    companyId,
    customerId: null,
    customer: { name: "ALSUM", addressLines: ["Chennai"], gstin: null, stateCode: "33", emails: [] },
    issueDate: "2099-03-01",
    dueDate: null,
    paymentTerms: null,
    currency: "INR",
    gstEnabled: true,
    taxRateBp: 1800,
    template: "classic",
    notes: null,
    lines: [{ id: randomUUID(), description: "Consulting", hsnSac: null, qty: 1, rateMinor: 100000 }],
    ...overrides,
  });

  beforeEach(async () => {
    await db.invoice.deleteMany({ where: { number: { startsWith: "TEST-" } } });
    await db.company.deleteMany({ where: { name: "Test Co" } });
    const company = await db.company.create({
      data: { name: "Test Co", addressLines: [], stateCode: "29" },
    });
    companyId = company.id;
    const invoice = await db.invoice.create({
      data: {
        number: `TEST-${randomUUID().slice(0, 8)}`,
        period: "9903",
        companyId,
        customerSnapshot: {},
        issueDate: new Date("2099-03-01T00:00:00Z"),
        currency: "INR",
        state: "DRAFT",
        version: 1,
      },
    });
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    await db.invoice.deleteMany({ where: { number: { startsWith: "TEST-" } } });
    await db.company.deleteMany({ where: { name: "Test Co" } });
    await db.$disconnect();
  });

  it("writes the totals the calculator produced and bumps the version", async () => {
    const result = await writeDraft(db, { id: invoiceId, expectedVersion: 1, draft: draft(), sellerStateCode: "29" });
    expect(result).toEqual({ ok: true, version: 2 });

    const row = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
    expect(row.subtotalMinor).toBe(100000n);
    expect(row.taxMinor).toBe(18000n); // IGST: Tamil Nadu customer, Karnataka seller
    expect(row.totalMinor).toBe(118000n);
    expect(row.version).toBe(2);
    expect(row.lines).toHaveLength(1);
  });

  it("refuses a stale version instead of overwriting the other tab's work", async () => {
    await writeDraft(db, { id: invoiceId, expectedVersion: 1, draft: draft({ notes: "first" }), sellerStateCode: "29" });
    // Second tab still believes it is on version 1.
    const stale = await writeDraft(db, {
      id: invoiceId,
      expectedVersion: 1,
      draft: draft({ notes: "second" }),
      sellerStateCode: "29",
    });

    expect(stale).toEqual({ ok: false, reason: "conflict" });
    const row = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(row.notes).toBe("first"); // the first save survived
    expect(row.version).toBe(2); // and the stale one did not bump it
  });

  it("replaces the lines rather than accumulating them", async () => {
    await writeDraft(db, { id: invoiceId, expectedVersion: 1, draft: draft(), sellerStateCode: "29" });
    const two = draft({
      lines: [
        { id: randomUUID(), description: "A", hsnSac: null, qty: 1, rateMinor: 100 },
        { id: randomUUID(), description: "B", hsnSac: null, qty: 1, rateMinor: 200 },
      ],
    });
    await writeDraft(db, { id: invoiceId, expectedVersion: 2, draft: two, sellerStateCode: "29" });

    const row = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
    expect(row.lines).toHaveLength(2);
    expect(row.subtotalMinor).toBe(300n);
  });

  it("refuses to touch a cancelled invoice, which keeps its number for the GST series", async () => {
    await db.invoice.update({ where: { id: invoiceId }, data: { state: "CANCELLED" } });
    const result = await writeDraft(db, { id: invoiceId, expectedVersion: 1, draft: draft(), sellerStateCode: "29" });
    expect(result).toEqual({ ok: false, reason: "cancelled" });
  });

  it("rejects a draft that fails validation rather than writing nonsense", async () => {
    const bad = draft({ lines: [{ id: randomUUID(), description: "x", hsnSac: null, qty: 1.23456, rateMinor: 1 }] });
    const result = await writeDraft(db, { id: invoiceId, expectedVersion: 1, draft: bad, sellerStateCode: "29" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  it("logs the edit in the same transaction as the write", async () => {
    const actorId = null;
    await writeDraft(db, { id: invoiceId, expectedVersion: 1, draft: draft(), sellerStateCode: "29", actorId });
    const log = await db.activityLog.findFirst({ where: { entityId: invoiceId, action: "edited" } });
    expect(log).not.toBeNull();
  });
});
