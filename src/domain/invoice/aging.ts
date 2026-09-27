export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const BUCKET_LABEL: Record<AgingBucket, string> = {
  current: "Not due yet",
  "1-30": "1–30 days late",
  "31-60": "31–60 days late",
  "61-90": "61–90 days late",
  "90+": "Over 90 days late",
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * How late an invoice is.
 *
 * An invoice with no due date counts as current, not ancient. Most of
 * FINCLUST's invoices carry no due date at all, and defaulting those to "over
 * 90 days" would paint the whole ledger red and make the number worth ignoring.
 */
export function bucketFor(dueDate: string | null, today: string): AgingBucket {
  if (!dueDate) return "current";
  const late = daysBetween(dueDate, today);
  if (late <= 0) return "current";
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  if (late <= 90) return "61-90";
  return "90+";
}

export interface AgingRow {
  bucket: AgingBucket;
  label: string;
  count: number;
  amountMinor: number;
}

/**
 * What is owed, grouped by how long it has been owed. Every bucket is returned
 * even when empty, so the chart keeps a stable shape rather than reflowing as
 * money moves between buckets.
 */
export function summariseAging(
  invoices: { dueDate: string | null; outstandingMinor: number }[],
  today: string,
): AgingRow[] {
  const totals = new Map<AgingBucket, { count: number; amountMinor: number }>(
    AGING_BUCKETS.map((b) => [b, { count: 0, amountMinor: 0 }]),
  );

  for (const invoice of invoices) {
    if (invoice.outstandingMinor <= 0) continue;
    const entry = totals.get(bucketFor(invoice.dueDate, today))!;
    entry.count += 1;
    entry.amountMinor += invoice.outstandingMinor;
  }

  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    label: BUCKET_LABEL[bucket],
    ...totals.get(bucket)!,
  }));
}
