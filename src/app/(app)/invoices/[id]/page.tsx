import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/permissions";
import { InvoiceEditor } from "@/features/invoices/editor/invoice-editor";
import { listCustomersForPicker, loadInvoice } from "@/features/invoices/queries";
import { listCatalog } from "@/features/catalog/queries";
import { listPayments } from "@/features/invoices/payments";
import { listShareLinks } from "@/features/invoices/share";
import { listSellerOptions } from "@/features/companies/queries";
import { listTimeline } from "@/features/invoices/versions";

export const dynamic = "force-dynamic";

export default async function InvoiceEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("read");
  const { id } = await params;

  const [invoice, customers, timeline, sellers, catalog, payments, shareLinks] = await Promise.all([
    loadInvoice(id),
    listCustomersForPicker(),
    listTimeline(id),
    listSellerOptions(),
    listCatalog(),
    listPayments(id),
    listShareLinks(id),
  ]);
  if (!invoice) notFound();

  return (
    <InvoiceEditor
      id={invoice.id}
      number={invoice.number}
      state={invoice.state}
      version={invoice.version}
      initialDraft={invoice.draft}
      company={invoice.company}
      customers={customers}
      timeline={timeline}
      sellers={sellers}
      catalog={catalog}
      canSend={can(user.role, "send")}
      payments={payments}
      shareLinks={shareLinks}
      // A cancelled invoice keeps its number for the GST series, so it stays
      // readable but must never change.
      canEdit={can(user.role, "write") && invoice.state !== "CANCELLED"}
    />
  );
}
