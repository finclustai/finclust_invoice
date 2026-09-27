"use server";

import { fillTemplate } from "@/domain/invoice/email";
import { loadTemplates } from "@/features/settings/templates";
import { buildSummaryCsv, type SummaryRow } from "@/domain/invoice/summary-csv";
import { deriveStatus } from "@/domain/invoice/status";
import { businessDay } from "@/domain/invoice/today";
import { fromMinor } from "@/domain/money/bigint";
import type { CurrencyCode } from "@/domain/money/currency";
import { periodLabel } from "@/features/invoices/status-style";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";
import {
  createDraft,
  draftsUrl,
  uploadAttachment,
  zohoConfigured,
  ZohoNotConfigured,
  ZohoRefused,
} from "@/infra/zoho-mail";
import { buildDocumentProps } from "@/pdf/props";
import { renderInvoicePdf } from "@/pdf/render";
import { rowToDraft, type InvoiceRow } from "./mapping";

/** Zoho's own limit is 20MB per message; stop well short of bouncing. */
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;

export interface PackPreview {
  period: string;
  label: string;
  count: number;
  currencies: string[];
  enabled: boolean;
}

/** What a month's pack would contain, before anything is built. */
export async function previewPack(period: string): Promise<PackPreview> {
  await requireUser("send");
  const invoices = await db.invoice.findMany({
    where: { period, state: { not: "DRAFT" } },
    select: { currency: true },
  });
  return {
    period,
    label: periodLabel(period),
    count: invoices.length,
    currencies: [...new Set(invoices.map((i) => i.currency))].sort(),
    enabled: zohoConfigured(),
  };
}

export type PackResult =
  | { ok: true; draftsUrl: string; attached: number; skipped: string[] }
  | { ok: false; problems: string[] };

/**
 * One Zoho draft holding every invoice issued in a month, plus a spreadsheet
 * summarising them.
 *
 * Cancelled invoices are included on purpose: a cancelled number still has to
 * be accounted for, and a gap in the series is exactly what an accountant will
 * ask about. Drafts are left out, because they were never issued.
 */
export async function buildCaPack(
  period: string,
  input: { to: string; cc: string },
): Promise<PackResult> {
  const user = await requireUser("send");

  const emails = (raw: string) =>
    raw.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
  const to = emails(input.to);
  if (to.length === 0) return { ok: false, problems: ["Add your accountant's email address"] };
  if (to.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) {
    return { ok: false, problems: ["One of those addresses doesn't look right"] };
  }

  const rows = await db.invoice.findMany({
    where: { period, state: { not: "DRAFT" } },
    orderBy: { number: "asc" },
    include: {
      company: true,
      lines: { orderBy: { position: "asc" } },
    },
  });
  if (rows.length === 0) return { ok: false, problems: [`Nothing was issued in ${periodLabel(period)}`] };

  try {
    const today = businessDay();
    const summary: SummaryRow[] = [];
    const attachments = [];
    const skipped: string[] = [];
    let bytes = 0;

    for (const row of rows) {
      const { draft, number, state } = rowToDraft(row as unknown as InvoiceRow);
      const { id: _id, defaultTemplate: _t, isArchived: _a, createdAt: _c, ...company } = row.company;
      const doc = buildDocumentProps(draft, company, number, state);

      const total = fromMinor(row.totalMinor);
      const paid = fromMinor(row.paidMinor);
      summary.push({
        number,
        issueDate: draft.issueDate,
        customerName: draft.customer.name,
        customerGstin: draft.customer.gstin,
        placeOfSupply: draft.customer.stateCode,
        currency: draft.currency,
        taxableMinor: doc.calc.subtotalMinor,
        cgstMinor: doc.calc.taxes.find((t) => t.label === "CGST")?.amountMinor ?? 0,
        sgstMinor: doc.calc.taxes.find((t) => t.label === "SGST")?.amountMinor ?? 0,
        igstMinor: doc.calc.taxes.find((t) => t.label === "IGST")?.amountMinor ?? 0,
        totalMinor: total,
        paidMinor: paid,
        status: deriveStatus(
          {
            state,
            totalMinor: total,
            paidMinor: paid,
            dueDate: draft.dueDate,
          },
          today,
        ),
      });

      const pdf = await renderInvoicePdf(doc);
      // The spreadsheet still lists an invoice whose PDF did not fit, so the
      // month's figures stay complete even when the attachments do not.
      if (bytes + pdf.length > MAX_TOTAL_BYTES) {
        skipped.push(number);
        continue;
      }
      bytes += pdf.length;
      attachments.push(await uploadAttachment(pdf, `${number}.pdf`));
    }

    const csv = Buffer.from(buildSummaryCsv(summary), "utf8");
    attachments.push(await uploadAttachment(csv, `invoices-${period}.csv`));

    const company = rows[0]!.company;
    const templates = await loadTemplates();
    const { subject, html } = fillTemplate(templates.pack, {
      invoice_number: "",
      customer: "",
      company: company.name,
      total: "",
      invoice_date: "",
      due_date: "",
      month: periodLabel(period),
      count: String(rows.length),
    });

    await createDraft({
      to,
      cc: emails(input.cc),
      subject,
      html:
        html +
        (skipped.length
          ? `<p style="margin:0 0 14px">${skipped.length} invoice(s) were too large to attach and are listed in the spreadsheet only: ${skipped.join(", ")}.</p>`
          : ""),
      attachments,
    });

    await db.activityLog.create({
      data: {
        actorId: user.id,
        entity: "period",
        entityId: period,
        action: "ca_pack",
        meta: { to, count: rows.length, skipped },
      },
    });

    return { ok: true, draftsUrl: draftsUrl(), attached: attachments.length - 1, skipped };
  } catch (error) {
    if (error instanceof ZohoNotConfigured) {
      return { ok: false, problems: ["Email isn't set up yet. Ask an admin to connect the Zoho mailbox."] };
    }
    if (error instanceof ZohoRefused) return { ok: false, problems: [error.message] };
    console.error("[buildCaPack]", error);
    return { ok: false, problems: ["Could not build the pack. Please try again."] };
  }
}
