"use server";

import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { formatMoneyWithCode, type CurrencyCode } from "@/domain/money/currency";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";
import { putObject, storageConfigured, StorageNotConfigured } from "@/infra/storage";
import { buildDocumentProps } from "@/pdf/props";
import { renderInvoicePdf } from "@/pdf/render";
import { loadInvoice } from "./queries";

/**
 * 24 random bytes. The link is the only thing protecting the document, so it
 * has to be long enough that guessing one is not a strategy.
 */
const newToken = () => randomBytes(24).toString("base64url");

export type ShareResult =
  | { ok: true; url: string; whatsappUrl: string | null; message: string }
  | { ok: false; problems: string[] };

/**
 * Freezes the invoice as it stands into storage and mints a link that opens it
 * without a login, so it can be sent on WhatsApp.
 *
 * The stored copy is deliberately a snapshot: what the customer opens stays
 * what they were sent, even if the invoice is edited afterwards. The link can
 * be revoked, and every open is counted.
 */
export async function shareInvoice(invoiceId: string): Promise<ShareResult> {
  const user = await requireUser("send");

  if (!storageConfigured()) {
    return { ok: false, problems: ["File storage isn't set up yet. Ask an admin to connect it."] };
  }

  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return { ok: false, problems: ["That invoice no longer exists"] };
  if (invoice.state === "DRAFT") {
    return { ok: false, problems: ["Issue the invoice before sharing it — a draft has no number yet."] };
  }

  try {
    const doc = buildDocumentProps(invoice.draft, invoice.company, invoice.number, invoice.state);
    const pdf = await renderInvoicePdf(doc);
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    const storagePath = `invoices/${invoiceId}/${sha256.slice(0, 16)}.pdf`;
    await putObject(storagePath, pdf, "application/pdf");

    const token = newToken();
    await db.$transaction(async (tx) => {
      const archive = await tx.pdfArchive.create({
        data: {
          invoiceId,
          version: invoice.version,
          storagePath,
          purpose: "whatsapp",
          sha256,
          createdById: user.id,
        },
        select: { id: true },
      });
      await tx.shareToken.create({ data: { token, archiveId: archive.id } });
      await tx.activityLog.create({
        data: {
          actorId: user.id,
          entity: "invoice",
          entityId: invoiceId,
          action: "shared",
          meta: { number: invoice.number },
        },
      });
    });

    const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3100";
    const url = `${base}/p/${token}`;
    const total = formatMoneyWithCode(doc.calc.totalMinor, invoice.draft.currency as CurrencyCode);
    const message =
      `Hello ${invoice.draft.customer.name}, here is invoice ${invoice.number} ` +
      `from ${invoice.company.name} for ${total}.\n${url}`;

    // Only digits reach wa.me; a saved phone may carry spaces or a plus.
    const digits = (invoice.draft.customer.emails.length ? "" : "").concat(
      (await db.customer.findUnique({
        where: { id: invoice.draft.customerId ?? "" },
        select: { phone: true },
      }))?.phone ?? "",
    ).replace(/\D/g, "");

    return {
      ok: true,
      url,
      whatsappUrl: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null,
      message,
    };
  } catch (error) {
    if (error instanceof StorageNotConfigured) {
      return { ok: false, problems: ["File storage isn't set up yet."] };
    }
    console.error("[shareInvoice]", error);
    return { ok: false, problems: ["Could not create the link. Please try again."] };
  }
}

export interface ShareLink {
  token: string;
  createdAt: string;
  openCount: number;
  revoked: boolean;
}

export async function listShareLinks(invoiceId: string): Promise<ShareLink[]> {
  await requireUser("read");
  const rows = await db.shareToken.findMany({
    where: { archive: { invoiceId } },
    orderBy: { createdAt: "desc" },
    select: { token: true, createdAt: true, openCount: true, revokedAt: true },
  });
  return rows.map((r) => ({
    token: r.token,
    createdAt: r.createdAt.toISOString(),
    openCount: r.openCount,
    revoked: r.revokedAt !== null,
  }));
}

/** Stops a link working, for when it went to the wrong person. */
export async function revokeShareLink(token: string): Promise<{ ok: boolean }> {
  const user = await requireUser("send");
  const link = await db.shareToken.findUnique({
    where: { token },
    select: { archive: { select: { invoiceId: true } } },
  });
  if (!link) return { ok: false };
  await db.shareToken.update({ where: { token }, data: { revokedAt: new Date() } });
  await db.activityLog.create({
    data: {
      actorId: user.id,
      entity: "invoice",
      entityId: link.archive.invoiceId,
      action: "link_revoked",
    },
  });
  return { ok: true };
}
