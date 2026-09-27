"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateInvoice } from "@/domain/invoice/calculate";
import { validateForIssue, type InvoiceDraft } from "@/domain/invoice/schema";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";
import { allocateInvoiceNumber } from "./allocate-number";
import { draftToRow } from "./mapping";
import { writeDraft, type SaveResult } from "./write-draft";

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

export type { SaveResult } from "./write-draft";

/** The server-action face of writeDraft: authorise, look up the seller, write. */
export async function saveDraft(
  id: string,
  expectedVersion: number,
  draft: InvoiceDraft,
): Promise<SaveResult> {
  const user = await requireUser("write");
  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { company: { select: { stateCode: true } } },
  });
  if (!invoice) return { ok: false, reason: "missing", problems: ["That invoice no longer exists"] };

  try {
    return await writeDraft(db, {
      id,
      expectedVersion,
      draft,
      sellerStateCode: invoice.company.stateCode,
      actorId: user.id,
    });
  } catch {
    return {
      ok: false,
      reason: "invalid",
      problems: ["Could not save. Check your connection and try again."],
    };
  }
}

export type IssueResult = { ok: true } | { ok: false; problems: string[] };

/** Moves a draft to issued, once it is complete enough to send. */
export async function issueInvoice(id: string, expectedVersion: number, draft: InvoiceDraft): Promise<IssueResult> {
  const user = await requireUser("write");

  const problems = validateForIssue(draft);
  if (problems.length) return { ok: false, problems };

  const saved = await saveDraft(id, expectedVersion, draft);
  if (!saved.ok) {
    return {
      ok: false,
      problems: [
        saved.reason === "conflict"
          ? "This invoice was changed somewhere else. Reload before issuing."
          : (saved.problems?.[0] ?? "Could not save the invoice"),
      ],
    };
  }

  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id },
    select: { number: true, state: true, company: { select: { name: true } } },
  });
  if (invoice.state !== "DRAFT") return { ok: false, problems: ["This invoice has already been issued"] };

  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: {
        state: "ISSUED",
        versions: {
          create: {
            version: saved.version,
            snapshot: { ...draft, number: invoice.number, companyName: invoice.company.name },
            reason: "Issued",
            userId: user.id,
          },
        },
      },
    });
    await tx.activityLog.create({
      data: { actorId: user.id, entity: "invoice", entityId: id, action: "issued", meta: { number: invoice.number } },
    });
  });

  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}
