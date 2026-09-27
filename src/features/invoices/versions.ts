import "server-only";
import { diffSnapshots, type Change } from "@/domain/invoice/diff";
import { summarise } from "@/domain/invoice/history";
import type { InvoiceSnapshot } from "@/domain/invoice/schema";
import { db } from "@/infra/db";

export type TimelineKind = "created" | "edited" | "issued" | "restored" | "cancelled" | "sent" | "paid";

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  actor: string | null;
  version: number | null;
  changeCount: number;
  summary: string;
  /** Only a version carrying a snapshot can be put back. */
  canRestore: boolean;
}

function kindOf(reason: string): TimelineKind {
  const r = reason.toLowerCase();
  if (r.startsWith("created")) return "created";
  if (r.startsWith("issued")) return "issued";
  if (r.startsWith("restored")) return "restored";
  if (r.startsWith("cancelled")) return "cancelled";
  return "edited";
}

/**
 * Older snapshots were written before later fields existed, and a snapshot is
 * never migrated — it is a record of what the invoice said at the time. Filling
 * the gaps on read is what keeps the drawer from crashing on old history.
 */
function readSnapshot(raw: unknown): InvoiceSnapshot {
  const s = (raw ?? {}) as Partial<InvoiceSnapshot>;
  return {
    number: s.number ?? "",
    companyName: s.companyName ?? "",
    companyId: s.companyId ?? "",
    customerId: s.customerId ?? null,
    customer: s.customer ?? { name: "", addressLines: [], gstin: null, stateCode: null, emails: [] },
    issueDate: s.issueDate ?? "",
    dueDate: s.dueDate ?? null,
    paymentTerms: s.paymentTerms ?? null,
    currency: s.currency ?? "INR",
    gstEnabled: s.gstEnabled ?? true,
    taxRateBp: s.taxRateBp ?? 1800,
    template: s.template ?? "classic",
    notes: s.notes ?? null,
    lines: (s.lines ?? []).map((l) => ({
      id: l.id,
      description: l.description ?? "",
      hsnSac: l.hsnSac ?? null,
      qty: l.qty ?? 0,
      rateMinor: l.rateMinor ?? 0,
    })),
  };
}

/** The whole story of an invoice, newest first. */
export async function listTimeline(invoiceId: string, limit = 50): Promise<TimelineEntry[]> {
  const [versions, activity] = await Promise.all([
    db.invoiceVersion.findMany({
      where: { invoiceId },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, version: true, snapshot: true, reason: true, userId: true, changeCount: true, updatedAt: true },
    }),
    db.activityLog.findMany({
      where: { entity: "invoice", entityId: invoiceId, action: { in: ["created", "sent", "paid"] } },
      orderBy: { at: "desc" },
      take: limit,
      select: { id: true, action: true, actorId: true, at: true },
    }),
  ]);

  // One lookup rather than a join per row.
  const ids = [...new Set([...versions.map((v) => v.userId), ...activity.map((a) => a.actorId)])].filter(
    (id): id is string => Boolean(id),
  );
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [
      u.id,
      u.name,
    ]),
  );

  const entries: TimelineEntry[] = [];
  versions.forEach((v, i) => {
    const previous = i > 0 ? readSnapshot(versions[i - 1]!.snapshot) : null;
    const current = readSnapshot(v.snapshot);
    const changes = previous ? diffSnapshots(previous, current) : [];
    entries.push({
      id: v.id,
      kind: kindOf(v.reason),
      at: v.updatedAt.toISOString(),
      actor: v.userId ? (users.get(v.userId) ?? null) : null,
      version: v.version,
      changeCount: v.changeCount,
      summary: previous ? summarise(changes) : v.reason,
      canRestore: true,
    });
  });

  for (const a of activity) {
    if (a.action === "created") continue; // the first version already says this
    entries.push({
      id: String(a.id),
      kind: a.action as TimelineKind,
      at: a.at.toISOString(),
      actor: a.actorId ? (users.get(a.actorId) ?? null) : null,
      version: null,
      changeCount: 0,
      summary: a.action === "sent" ? "Sent to the customer" : "Payment recorded",
      canRestore: false,
    });
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

/** One version's content, and what it changed from the one before it. */
export async function loadVersionWithDiff(
  invoiceId: string,
  versionId: string,
): Promise<{ snapshot: InvoiceSnapshot; changes: Change[] } | null> {
  const row = await db.invoiceVersion.findFirst({
    where: { id: versionId, invoiceId },
    select: { snapshot: true, createdAt: true },
  });
  if (!row) return null;

  const previous = await db.invoiceVersion.findFirst({
    where: { invoiceId, createdAt: { lt: row.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { snapshot: true },
  });

  const snapshot = readSnapshot(row.snapshot);
  return {
    snapshot,
    changes: previous ? diffSnapshots(readSnapshot(previous.snapshot), snapshot) : [],
  };
}
