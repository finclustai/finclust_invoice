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

export type { SaveResult } from "./write-draft";

/** Today in IST. The invoice date decides the number's period, so the server's
 *  UTC day would file a 1 Sep IST invoice under August. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** A draft has no GST number yet, but the column is unique and not null. */
const draftNumber = () => `DRAFT-${randomUUID().slice(0, 8)}`;

/**
 * Creates an empty draft and opens it.
 *
 * Deliberately allocates NO invoice number. A number taken here is burnt by
 * every abandoned draft, and would still say August on an invoice whose date
 * was later moved to September — a GST invoice filed under the wrong return.
 * The number is taken when the invoice is issued, from the date it has then.
 */
export async function createDraftInvoice(): Promise<never> {
  const user = await requireUser("write");
  const company = await db.company.findFirst({
    where: { isArchived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, defaultTemplate: true, stateCode: true },
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

  const calc = calculateInvoice(draft.lines, {
    currency: draft.currency,
    gstEnabled: draft.gstEnabled,
    taxRateBp: draft.taxRateBp,
    sellerStateCode: company.stateCode,
    placeOfSupplyStateCode: draft.customer.stateCode,
  });
  const { lines, ...row } = draftToRow(draft, calc);

  const id = await db.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        ...row,
        number: draftNumber(),
        companyId: company.id,
        state: "DRAFT",
        createdById: user.id,
        lines: { create: lines },
      },
      select: { id: true },
    });
    await tx.activityLog.create({
      data: { actorId: user.id, entity: "invoice", entityId: created.id, action: "created" },
    });
    return created.id;
  });

  redirect(`/invoices/${id}`);
}

/** The server-action face of writeDraft: authorise, find the seller, write. */
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
  } catch (error) {
    // Logged rather than swallowed: a bad line id or a dangling customer would
    // otherwise reach the user as "check your connection".
    console.error("[saveDraft]", error);
    return { ok: false, reason: "invalid", problems: ["Could not save. Please try again."] };
  }
}

export type IssueResult = { ok: true; number: string } | { ok: false; problems: string[] };

class AlreadyIssued extends Error {}

/**
 * Turns a draft into a real invoice: saves it, then takes the next number in
 * the series for the month its date falls in.
 *
 * The number is allocated inside the same transaction that flips the state,
 * behind a `state: "DRAFT"` guard. If two clicks race, one wins and the
 * loser's transaction rolls back — including its counter increment — so the
 * series gains no gap and nothing is issued twice.
 */
export async function issueInvoice(
  id: string,
  expectedVersion: number,
  draft: InvoiceDraft,
): Promise<IssueResult> {
  const user = await requireUser("write");

  const problems = validateForIssue(draft);
  if (problems.length) return { ok: false, problems };

  const current = await db.invoice.findUnique({
    where: { id },
    select: { state: true, company: { select: { name: true } } },
  });
  if (!current) return { ok: false, problems: ["That invoice no longer exists"] };
  // Checked before saving, so a rejected call leaves no side effects behind.
  if (current.state !== "DRAFT") return { ok: false, problems: ["This invoice has already been issued"] };

  const saved = await saveDraft(id, expectedVersion, draft);
  if (!saved.ok) {
    return {
      ok: false,
      problems: [
        saved.reason === "conflict"
          ? "Someone else changed this invoice. Reload before issuing."
          : (saved.problems?.[0] ?? "Could not save the invoice"),
      ],
    };
  }

  try {
    const number = await db.$transaction(async (tx) => {
      const allocated = await allocateInvoiceNumber(tx, draft.issueDate);
      const claimed = await tx.invoice.updateMany({
        where: { id, state: "DRAFT" },
        data: { state: "ISSUED", number: allocated.number, period: allocated.period },
      });
      if (claimed.count === 0) throw new AlreadyIssued();

      await tx.invoiceVersion.create({
        data: {
          invoiceId: id,
          version: saved.version,
          snapshot: { ...draft, number: allocated.number, companyName: current.company.name },
          reason: "Issued",
          userId: user.id,
        },
      });
      await tx.activityLog.create({
        data: {
          actorId: user.id,
          entity: "invoice",
          entityId: id,
          action: "issued",
          meta: { number: allocated.number },
        },
      });
      return allocated.number;
    });

    revalidatePath(`/invoices/${id}`);
    revalidatePath("/invoices");
    return { ok: true, number };
  } catch (error) {
    if (error instanceof AlreadyIssued) {
      return { ok: false, problems: ["This invoice has already been issued"] };
    }
    console.error("[issueInvoice]", error);
    return { ok: false, problems: ["Could not issue the invoice. Please try again."] };
  }
}
