import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { InvoiceDraft } from "@/domain/invoice/schema";
import { writeDraft } from "./write-draft";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("version sessions (needs TEST_DATABASE_URL)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  let companyId = "";
  let invoiceId = "";
  let alice = "";
  let bob = "";

  const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
    companyId,
    customerId: null,
    customer: { name: "ALSUM", addressLines: ["Chennai"], gstin: null, stateCode: "33", emails: [] },
    issueDate: "2099-04-01",
    dueDate: null,
    paymentTerms: null,
    currency: "INR",
    gstEnabled: true,
    taxRateBp: 1800,
    template: "classic",
    notes: null,
    lines: [{ id: randomUUID(), description: "Consulting", hsnSac: null, qty: 1, rateMinor: 100000 }],
    ...over,
  });

  const save = (version: number, d: InvoiceDraft, actorId: string, now?: Date) =>
    writeDraft(db, { id: invoiceId, expectedVersion: version, draft: d, sellerStateCode: "29", actorId, now });

  const versions = () =>
    db.invoiceVersion.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" } });

  beforeEach(async () => {
    await db.invoice.deleteMany({ where: { number: { startsWith: "VTEST-" } } });
    await db.company.deleteMany({ where: { name: "Version Co" } });
    await db.user.deleteMany({ where: { email: { in: ["alice@t.test", "bob@t.test"] } } });

    companyId = (await db.company.create({ data: { name: "Version Co", addressLines: [], stateCode: "29" } })).id;
    alice = (await db.user.create({ data: { email: "alice@t.test", name: "Alice", passwordHash: "x" } })).id;
    bob = (await db.user.create({ data: { email: "bob@t.test", name: "Bob", passwordHash: "x" } })).id;
    invoiceId = (
      await db.invoice.create({
        data: {
          number: `VTEST-${randomUUID().slice(0, 8)}`,
          period: "9904",
          companyId,
          customerSnapshot: {},
          issueDate: new Date("2099-04-01T00:00:00Z"),
          currency: "INR",
          state: "DRAFT",
          version: 1,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await db.invoice.deleteMany({ where: { number: { startsWith: "VTEST-" } } });
    await db.company.deleteMany({ where: { name: "Version Co" } });
    await db.user.deleteMany({ where: { email: { in: ["alice@t.test", "bob@t.test"] } } });
    await db.$disconnect();
  });

  it("collapses a run of autosaves into one entry, keeping the latest content", async () => {
    const t = new Date("2099-04-01T10:00:00Z");
    await save(1, draft({ notes: "first" }), alice, t);
    await save(2, draft({ notes: "second" }), alice, new Date(t.getTime() + 60_000));
    await save(3, draft({ notes: "third" }), alice, new Date(t.getTime() + 120_000));

    const rows = await versions();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changeCount).toBe(3);
    expect((rows[0]!.snapshot as { notes: string }).notes).toBe("third");
  });

  it("starts a new entry once the gap is longer than a sitting", async () => {
    const t = new Date("2099-04-01T10:00:00Z");
    await save(1, draft({ notes: "morning" }), alice, t);
    await save(2, draft({ notes: "afternoon" }), alice, new Date(t.getTime() + 45 * 60_000));

    const rows = await versions();
    expect(rows).toHaveLength(2);
    expect((rows[0]!.snapshot as { notes: string }).notes).toBe("morning");
    expect((rows[1]!.snapshot as { notes: string }).notes).toBe("afternoon");
  });

  it("never merges two people's edits, however close together", async () => {
    const t = new Date("2099-04-01T10:00:00Z");
    await save(1, draft({ notes: "alice was here" }), alice, t);
    await save(2, draft({ notes: "bob was here" }), bob, new Date(t.getTime() + 30_000));

    const rows = await versions();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userId)).toEqual([alice, bob]);
  });

  it("writes no history when the save itself was refused", async () => {
    await save(1, draft({ notes: "kept" }), alice);
    await save(1, draft({ notes: "stale" }), alice); // conflict

    const rows = await versions();
    expect(rows).toHaveLength(1);
    expect((rows[0]!.snapshot as { notes: string }).notes).toBe("kept");
  });

  it("records the version the save produced, so a restore can name it", async () => {
    await save(1, draft(), alice);
    const rows = await versions();
    expect(rows[0]!.version).toBe(2);
  });
});
