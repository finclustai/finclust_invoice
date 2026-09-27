"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPaymentMethod, summarisePayments } from "@/domain/invoice/payments";
import { businessDay } from "@/domain/invoice/today";
import { fromMinor, toMinor } from "@/domain/money/bigint";
import { parseMoney } from "@/domain/money/currency";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";

export interface PaymentRow {
  id: string;
  date: string;
  amountMinor: number;
  method: string;
  reference: string | null;
}

export type PaymentResult = { ok: true } | { ok: false; problems: string[] };

const input = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date"),
  method: z.string().refine(isPaymentMethod, "Choose how it was paid"),
  reference: z.string().trim().max(120).nullable(),
});

/**
 * Rewrites the invoice's cached paid total from its payments.
 *
 * The payments are the truth; `paidMinor` on the invoice exists only so the
 * list can show a status without loading every payment. Recomputing it inside
 * the same transaction is what stops the two drifting apart — an incremented
 * counter would go wrong the first time a payment was corrected or removed.
 */
async function recacheTotal(tx: typeof db, invoiceId: string): Promise<void> {
  const payments = await tx.payment.findMany({
    where: { invoiceId },
    select: { amountMinor: true },
  });
  const { paidMinor } = summarisePayments(
    payments.map((p) => ({ amountMinor: fromMinor(p.amountMinor) })),
    0,
  );
  await tx.invoice.update({ where: { id: invoiceId }, data: { paidMinor: toMinor(paidMinor) } });
}

export async function recordPayment(
  invoiceId: string,
  fields: { date: string; amount: string; method: string; reference: string },
): Promise<PaymentResult> {
  const user = await requireUser("write");

  const parsed = input.safeParse({
    date: fields.date,
    method: fields.method,
    reference: fields.reference.trim() || null,
  });
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => i.message) };

  // The same parser the invoice grid uses, so "1,50,000" means the same here.
  const amountMinor = parseMoney(fields.amount);
  if (amountMinor === null) return { ok: false, problems: [`“${fields.amount}” isn’t an amount`] };
  if (amountMinor === 0) return { ok: false, problems: ["Enter how much was paid"] };

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { state: true } });
  if (!invoice) return { ok: false, problems: ["That invoice no longer exists"] };
  if (invoice.state === "DRAFT") {
    return { ok: false, problems: ["Issue the invoice before recording a payment against it"] };
  }

  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId,
        date: new Date(`${parsed.data.date}T00:00:00.000Z`),
        amountMinor: toMinor(amountMinor),
        method: parsed.data.method,
        reference: parsed.data.reference,
        createdById: user.id,
      },
    });
    await recacheTotal(tx as unknown as typeof db, invoiceId);
    await tx.activityLog.create({
      data: {
        actorId: user.id,
        entity: "invoice",
        entityId: invoiceId,
        action: "paid",
        meta: { amountMinor, method: parsed.data.method, date: parsed.data.date },
      },
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

/** Removes a payment recorded by mistake, and corrects the invoice's total. */
export async function removePayment(paymentId: string): Promise<PaymentResult> {
  const user = await requireUser("write");
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { invoiceId: true, amountMinor: true },
  });
  if (!payment) return { ok: false, problems: ["That payment no longer exists"] };

  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });
    await recacheTotal(tx as unknown as typeof db, payment.invoiceId);
    await tx.activityLog.create({
      data: {
        actorId: user.id,
        entity: "invoice",
        entityId: payment.invoiceId,
        action: "payment_removed",
        meta: { amountMinor: fromMinor(payment.amountMinor) },
      },
    });
  });

  revalidatePath(`/invoices/${payment.invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

/** Records the whole outstanding balance in one click, dated today. */
export async function markPaidInFull(invoiceId: string): Promise<PaymentResult> {
  await requireUser("write");
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { totalMinor: true, paidMinor: true },
  });
  if (!invoice) return { ok: false, problems: ["That invoice no longer exists"] };

  const outstanding = fromMinor(invoice.totalMinor) - fromMinor(invoice.paidMinor);
  if (outstanding <= 0) return { ok: false, problems: ["This invoice is already settled"] };

  return recordPayment(invoiceId, {
    date: businessDay(),
    amount: String(outstanding / 100),
    method: "Bank transfer",
    reference: "",
  });
}

export async function listPayments(invoiceId: string): Promise<PaymentRow[]> {
  await requireUser("read");
  const rows = await db.payment.findMany({
    where: { invoiceId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, amountMinor: true, method: true, reference: true },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    amountMinor: fromMinor(r.amountMinor),
    method: r.method,
    reference: r.reference,
  }));
}
