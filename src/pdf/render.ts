import "server-only";
import { createElement } from "react";
import type { InvoiceDocumentProps } from "./props";

/**
 * Draws an invoice. The same component draws the editor's live preview, so the
 * file someone downloads cannot differ from what they approved on screen.
 *
 * Both @react-pdf and the document that imports it are pulled in when this is
 * first called, not when the module loads. @react-pdf reaches for
 * "@react-pdf/hyphenate/en-us", a subpath its own package.json never declares
 * in `exports`; a bundler resolves that by falling back to the file path,
 * Node's resolver refuses. On a serverless deploy the refusal happened while
 * the route's module graph was still loading, which killed the whole function
 * before any handler existed to report it — the request just returned an empty
 * 500. Inside a function the same failure is catchable and can say what it is.
 */
export async function renderInvoicePdf(doc: InvoiceDocumentProps): Promise<Buffer> {
  const [{ renderToBuffer }, { InvoiceDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./invoice-document"),
  ]);
  // createElement rather than JSX, so this file has no static dependency on
  // the document at all. The cast is because renderToBuffer types its argument
  // as a <Document>, which is exactly what InvoiceDocument returns.
  const element = createElement(InvoiceDocument, { doc }) as Parameters<typeof renderToBuffer>[0];
  return renderToBuffer(element);
}
