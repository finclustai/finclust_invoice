import { requireUser } from "@/features/auth/current-user";
import { loadInvoice } from "@/features/invoices/queries";
import { buildDocumentProps } from "@/pdf/props";
import { renderInvoicePdf } from "@/pdf/render";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser("read");
  const { id } = await params;
  const invoice = await loadInvoice(id);
  if (!invoice) return new Response("Not found", { status: 404 });

  const doc = buildDocumentProps(invoice.draft, invoice.company, invoice.number, invoice.state);
  const pdf = await renderInvoicePdf(doc);

  // ?inline=1 is what the preview iframe uses; a plain hit downloads the file.
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${invoice.number}.pdf"`,
      // A draft changes on every keystroke, and even an issued invoice can be
      // edited, so a cached copy would hand someone a stale document.
      "Cache-Control": "no-store",
    },
  });
}
