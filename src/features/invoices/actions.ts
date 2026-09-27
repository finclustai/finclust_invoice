"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { calculateInvoice } from "@/domain/invoice/calculate";
import type { InvoiceDraft } from "@/domain/invoice/schema";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";
import { allocateInvoiceNumber } from "./allocate-number";
import { draftToRow } from "./mapping";

/** Today in IST, as YYYY-MM-DD. The invoice date decides the number's period,
 *  so using the server's UTC day would put a 1 Sep IST invoice in August. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/**
 * Creates an empty draft and sends the user straight into the editor. The
 * number is allocated in the same transaction as the insert, so a failure
 * rolls the counter back and the series keeps no gaps.
 */
export async function createDraftInvoice(): Promise<never> {
  const user = await requireUser("write");
  const company = await db.company.findFirst({
    where: { isArchived: false },
    select: { id: true, defaultTemplate: true },
  });
  if (!company) throw new Error("No seller company is set up yet");

  const issueDate = todayInIndia();
  const draft: InvoiceDraft = {
    companyId: company.id,
    customerId: null,
    customer: { name: "", addressLines: [], gstin: null, stateCode: null, emails: [] },
    issueDate,
    dueDate: null,
    paymentTerms: null,
    currency: "INR",
    gstEnabled: true,
    taxRateBp: 1800,
    template: company.defaultTemplate,
    notes: null,
    lines: [{ id: randomUUID(), description: "", hsnSac: null, qty: 1, rateMinor: 0 }],
  };

  const id = await db.$transaction(async (tx) => {
    const { period, number } = await allocateInvoiceNumber(tx, issueDate);
    const calc = calculateInvoice(draft.lines, {
      currency: draft.currency,
      gstEnabled: draft.gstEnabled,
      taxRateBp: draft.taxRateBp,
      sellerStateCode: "00",
      placeOfSupplyStateCode: null,
    });
    const { lines, ...row } = draftToRow(draft, calc);
    const created = await tx.invoice.create({
      data: {
        ...row,
        number,
        period,
        companyId: company.id,
        state: "DRAFT",
        createdById: user.id,
        lines: { create: lines },
        versions: {
          create: {
            version: 1,
            snapshot: { ...draft, number, companyName: "" },
            reason: "Created",
            userId: user.id,
          },
        },
      },
      select: { id: true },
    });
    // In the same transaction as the write, so an invoice can never exist
    // without its log entry, nor be logged without existing.
    await tx.activityLog.create({
      data: { actorId: user.id, entity: "invoice", entityId: created.id, action: "created", meta: { number } },
    });
    return created.id;
  });

  redirect(`/invoices/${id}`);
}
