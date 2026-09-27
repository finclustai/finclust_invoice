import { calculateInvoice } from "@/domain/invoice/calculate";
import { invoiceDraftSchema, type InvoiceDraft } from "@/domain/invoice/schema";
import { draftToRow } from "./mapping";
import { recordVersion } from "./record-version";

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: "conflict" | "cancelled" | "invalid" | "missing"; problems?: string[] };

/**
 * Just the database calls this needs, so the real client and a plain one in
 * tests both satisfy it without either's generics leaking in here.
 */
type WriteDb = {
  invoice: {
    findUnique(args: unknown): Promise<{ state: string; number: string; company: { name: string } } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  invoiceLine: { deleteMany(args: unknown): Promise<unknown>; createMany(args: unknown): Promise<unknown> };
  activityLog: { create(args: unknown): Promise<unknown> };
  invoiceVersion: {
    findFirst(args: unknown): Promise<{
      id: string; userId: string | null; createdAt: Date; updatedAt: Date; changeCount: number; reason: string;
    } | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: WriteDb) => Promise<T>): Promise<T>;
};

/**
 * Writes a draft, refusing to clobber a change someone else made first.
 *
 * The guard is `where: { id, version: expectedVersion }`. If another tab saved
 * in between, the row no longer matches, nothing is written, and the caller is
 * told. Overwriting silently is the outcome worth engineering against: the
 * lost edit is invisible to both people.
 *
 * Takes its database as an argument so the guard can be tested for real,
 * rather than through a stand-in that re-implements it.
 */
export async function writeDraft(
  db: unknown,
  opts: {
    id: string;
    expectedVersion: number;
    draft: InvoiceDraft;
    sellerStateCode: string;
    actorId?: string | null;
    /** Injectable so the session-coalescing tests need no real clock. */
    now?: Date;
    /** Labels the timeline entry; anything but "Edited" stands alone. */
    reason?: string;
  },
): Promise<SaveResult> {
  const client = db as WriteDb;
  const parsed = invoiceDraftSchema.safeParse(opts.draft);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", problems: parsed.error.issues.map((i) => i.message) };
  }

  const current = await client.invoice.findUnique({
    where: { id: opts.id },
    select: { state: true, number: true, company: { select: { name: true } } },
  });
  if (!current) return { ok: false, reason: "missing", problems: ["That invoice no longer exists"] };
  // A cancelled invoice keeps its number so the GST series has no gaps; it must
  // stay exactly as it was when it was cancelled.
  if (current.state === "CANCELLED") return { ok: false, reason: "cancelled" };

  const calc = calculateInvoice(parsed.data.lines, {
    currency: parsed.data.currency,
    gstEnabled: parsed.data.gstEnabled,
    taxRateBp: parsed.data.taxRateBp,
    sellerStateCode: opts.sellerStateCode,
    placeOfSupplyStateCode: parsed.data.customer.stateCode,
  });
  const { lines, ...row } = draftToRow(parsed.data, calc);

  return client.$transaction(async (tx) => {
    const claimed = await tx.invoice.updateMany({
      where: { id: opts.id, version: opts.expectedVersion },
      data: { ...row, version: { increment: 1 } },
    });
    if (claimed.count === 0) return { ok: false, reason: "conflict" };

    // Replaced rather than diffed: one edit can reorder, insert and delete at
    // once, and a full replace cannot drift from what the user is looking at.
    await tx.invoiceLine.deleteMany({ where: { invoiceId: opts.id } });
    await tx.invoiceLine.createMany({ data: lines.map((l) => ({ ...l, invoiceId: opts.id })) });
    // In the same transaction as the write, so an edit can never happen
    // unlogged, nor be logged without happening.
    const version = opts.expectedVersion + 1;
    // In the same transaction as the write, so the history cannot disagree
    // with what is on the invoice.
    await recordVersion(tx, {
      invoiceId: opts.id,
      version,
      snapshot: { ...parsed.data, number: current.number, companyName: current.company.name },
      reason: opts.reason ?? "Edited",
      userId: opts.actorId ?? null,
      state: current.state as never,
      now: opts.now ?? new Date(),
    });
    await tx.activityLog.create({
      data: { actorId: opts.actorId ?? null, entity: "invoice", entityId: opts.id, action: "edited" },
    });
    return { ok: true, version };
  });
}
