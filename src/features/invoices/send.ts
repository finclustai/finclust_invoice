"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildInvoiceEmail, type Audience } from "@/domain/invoice/email";
import { formatMoneyWithCode, type CurrencyCode } from "@/domain/money/currency";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";
import { buildDocumentProps, formatLongDate } from "@/pdf/props";
import { renderInvoicePdf } from "@/pdf/render";
import {
  createDraft,
  draftsUrl,
  mailboxAddress,
  uploadAttachment,
  zohoConfigured,
  ZohoNotConfigured,
  ZohoRefused,
} from "@/infra/zoho-mail";
import { loadInvoice } from "./queries";

const emails = (raw: string) =>
  raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);

const sendInput = z.object({
  to: z.array(z.string().email("That isn't a valid email address")).min(1, "Add at least one recipient"),
  cc: z.array(z.string().email("That isn't a valid email address")),
  subject: z.string().trim().min(1, "Give the message a subject").max(300),
  html: z.string().trim().min(1, "The message is empty").max(20_000),
});

export interface SendPrefill {
  enabled: boolean;
  mailbox: string | null;
  to: string[];
  subject: string;
  html: string;
  recentRecipients: string[];
}

/** What the send dialog opens with: the customer's addresses and a draft message. */
export async function prepareSend(invoiceId: string, audience: Audience): Promise<SendPrefill> {
  await requireUser("send");
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) throw new Error("That invoice no longer exists");

  const { draft, number, state, company } = invoice;
  const doc = buildDocumentProps(draft, company, number, state);
  const { subject, html } = buildInvoiceEmail(audience, {
    number: doc.number,
    customerName: draft.customer.name,
    companyName: company.name,
    total: formatMoneyWithCode(doc.calc.totalMinor, draft.currency as CurrencyCode),
    issueDate: formatLongDate(draft.issueDate),
    dueDate: draft.dueDate ? formatLongDate(draft.dueDate) : null,
    count: 1,
  });

  // Who this mailbox has written to before, so the CA's address is typed once.
  const recent = await db.activityLog.findMany({
    where: { action: "sent" },
    orderBy: { at: "desc" },
    take: 40,
    select: { meta: true },
  });
  const recentRecipients = [
    ...new Set(recent.flatMap((r) => ((r.meta as { to?: string[] } | null)?.to ?? []) as string[])),
  ].slice(0, 8);

  return {
    enabled: zohoConfigured(),
    mailbox: zohoConfigured() ? await mailboxAddress().catch(() => null) : null,
    to: audience === "client" ? draft.customer.emails : [],
    subject,
    html,
    recentRecipients,
  };
}

export type SendResult =
  | { ok: true; draftsUrl: string; mailbox: string }
  | { ok: false; problems: string[] };

/**
 * Attaches the invoice PDF to a new Zoho draft.
 *
 * It creates a draft and never sends: the last look before a document reaches
 * a client belongs to a person. The same path serves the customer and the
 * accountant — only the recipients and the wording differ.
 */
export async function sendInvoice(
  invoiceId: string,
  input: { to: string; cc: string; subject: string; html: string },
): Promise<SendResult> {
  const user = await requireUser("send");

  const parsed = sendInput.safeParse({
    to: emails(input.to),
    cc: emails(input.cc),
    subject: input.subject,
    html: input.html,
  });
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => i.message) };

  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return { ok: false, problems: ["That invoice no longer exists"] };
  if (invoice.state === "DRAFT") {
    return { ok: false, problems: ["Issue the invoice before sending it — a draft has no number yet."] };
  }

  try {
    const doc = buildDocumentProps(invoice.draft, invoice.company, invoice.number, invoice.state);
    const pdf = await renderInvoicePdf(doc);
    const attachment = await uploadAttachment(pdf, `${invoice.number}.pdf`);
    const { from } = await createDraft({
      to: parsed.data.to,
      cc: parsed.data.cc,
      subject: parsed.data.subject,
      html: parsed.data.html,
      attachments: [attachment],
    });

    await db.activityLog.create({
      data: {
        actorId: user.id,
        entity: "invoice",
        entityId: invoiceId,
        action: "sent",
        meta: {
          to: parsed.data.to,
          cc: parsed.data.cc,
          subject: parsed.data.subject,
          number: invoice.number,
        },
      },
    });

    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, draftsUrl: draftsUrl(), mailbox: from };
  } catch (error) {
    if (error instanceof ZohoNotConfigured) {
      return { ok: false, problems: ["Email isn't set up yet. Ask an admin to connect the Zoho mailbox."] };
    }
    if (error instanceof ZohoRefused) return { ok: false, problems: [error.message] };
    console.error("[sendInvoice]", error);
    return { ok: false, problems: ["Could not create the draft. Please try again."] };
  }
}
