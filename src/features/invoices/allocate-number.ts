import type { Prisma } from "@prisma/client";
import { formatInvoiceNumber, periodOf } from "@/domain/invoice/numbering";

/**
 * Must run inside the transaction that creates the invoice, so a failed
 * create rolls the counter back and the series has no gaps.
 * Prisma turns this upsert into a single INSERT … ON CONFLICT DO UPDATE
 * (single unique key, no nested writes), which is atomic under concurrency.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
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
