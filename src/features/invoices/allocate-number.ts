import { formatInvoiceNumber, periodOf } from "@/domain/invoice/numbering";

/**
 * Just the one call this needs, so it accepts a transaction from either the
 * retrying client the app uses or a plain one in tests, without either's
 * generics leaking in here.
 */
export interface CounterStore {
  invoiceCounter: {
    upsert(args: {
      where: { period: string };
      create: { period: string; last: number };
      update: { last: { increment: number } };
    }): Promise<{ period: string; last: number }>;
  };
}

/**
 * Must run inside the transaction that creates the invoice, so a failed
 * create rolls the counter back and the series has no gaps.
 * Prisma turns this upsert into a single INSERT … ON CONFLICT DO UPDATE
 * (single unique key, no nested writes), which is atomic under concurrency.
 */
export async function allocateInvoiceNumber(
  tx: CounterStore,
  issueDate: string,
): Promise<{ period: string; number: string }> {
  const period = periodOf(issueDate);
  const counter = await tx.invoiceCounter.upsert({
    where: { period },
    create: { period, last: 1 },
    update: { last: { increment: 1 } },
  });
  return { period, number: formatInvoiceNumber(period, counter.last) };
}
