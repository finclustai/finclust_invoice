import { joinsSession } from "@/domain/invoice/history";
import type { InvoiceSnapshot } from "@/domain/invoice/schema";
import type { InvoiceState } from "@/domain/invoice/status";

/** Just the calls this needs, so a transaction from any client satisfies it. */
export interface VersionStore {
  invoiceVersion: {
    findFirst(args: unknown): Promise<{
      id: string;
      userId: string | null;
      createdAt: Date;
      updatedAt: Date;
      changeCount: number;
      reason: string;
    } | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
}

/**
 * Keeps the invoice's history readable.
 *
 * Autosave fires every time typing stops, so one snapshot per save would turn
 * an afternoon's work into hundreds of near-identical rows — history nobody
 * can read is history nobody uses. A save by the same person, in the same
 * state, within one sitting therefore updates the entry already at the top
 * instead of adding another, and counts itself.
 *
 * Runs inside the caller's transaction, so a save can never land without its
 * history entry, nor an entry without its save.
 */
export async function recordVersion(
  tx: VersionStore,
  opts: {
    invoiceId: string;
    version: number;
    snapshot: InvoiceSnapshot;
    reason: string;
    userId: string | null;
    state: InvoiceState;
    now: Date;
  },
): Promise<void> {
  const head = await tx.invoiceVersion.findFirst({
    where: { invoiceId: opts.invoiceId },
    orderBy: { createdAt: "desc" },
  });

  // Milestones always stand alone: "Issued" or "Restored from 12 Sep" is the
  // thing someone is looking for, and folding it into an edit would hide it.
  const isMilestone = opts.reason !== "Edited";
  const canJoin =
    !isMilestone &&
    head?.reason === "Edited" &&
    joinsSession(
      { userId: head.userId, state: opts.state, at: head.updatedAt.getTime() },
      { userId: opts.userId, state: opts.state, at: opts.now.getTime() },
    );

  if (canJoin && head) {
    await tx.invoiceVersion.update({
      where: { id: head.id },
      data: {
        version: opts.version,
        snapshot: opts.snapshot,
        changeCount: head.changeCount + 1,
        updatedAt: opts.now,
      },
    });
    return;
  }

  await tx.invoiceVersion.create({
    data: {
      invoiceId: opts.invoiceId,
      version: opts.version,
      snapshot: opts.snapshot,
      reason: opts.reason,
      userId: opts.userId,
      changeCount: 1,
      createdAt: opts.now,
      updatedAt: opts.now,
    },
  });
}
