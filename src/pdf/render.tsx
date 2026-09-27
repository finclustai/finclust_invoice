import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "./invoice-document";
import type { InvoiceDocumentProps } from "./props";

/**
 * The same component draws the editor's live preview, so the file someone
 * downloads cannot drift from what they were looking at when they clicked.
 */
export async function renderInvoicePdf(doc: InvoiceDocumentProps): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument doc={doc} />);
}
