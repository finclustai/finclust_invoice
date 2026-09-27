"use client";

import { useEffect, useRef, useState } from "react";
import { usePDF } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/pdf/invoice-document";
import type { InvoiceDocumentProps } from "@/pdf/props";

const RERENDER_MS = 400;

/**
 * The live preview. Renders the very same component the download route uses,
 * so the file a client receives cannot differ from what was approved here.
 *
 * usePDF keeps the previous blob URL in state while the next render runs, so
 * typing never flashes the panel white. The iframe's `key` is held constant
 * and only its `src` changes, which keeps the browser's PDF viewer from
 * jumping back to page one every time typing pauses on a long invoice.
 */
export default function PdfCanvas({ doc }: { doc: InvoiceDocumentProps }) {
  const [settled, setSettled] = useState(doc);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSettled(doc), RERENDER_MS);
    return () => clearTimeout(timer.current);
  }, [doc]);

  const [instance, update] = usePDF({ document: <InvoiceDocument doc={settled} /> });

  // Skips the first run: usePDF has already rendered the initial document, and
  // updating again here would render it twice on mount.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    update(<InvoiceDocument doc={settled} />);
  }, [settled, update]);

  if (instance.error) {
    return (
      <div className="grid h-full place-items-center bg-sand p-6 text-center">
        <p className="error-line">
          Could not draw the preview. The invoice itself is safe — try reloading.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-sand">
      {instance.url ? (
        <iframe
          // #toolbar=0 hides the viewer's own chrome, so the panel is the frame.
          src={`${instance.url}#toolbar=0&navpanes=0&view=FitH`}
          title="Invoice preview"
          className="h-full w-full border-0"
        />
      ) : (
        <div className="grid h-full place-items-center text-sm text-mid">Drawing the invoice…</div>
      )}
      {instance.loading && instance.url && (
        <span className="absolute top-3 right-3 rounded-full bg-paper/90 px-2 py-0.5 text-xs text-mid shadow-soft">
          updating…
        </span>
      )}
    </div>
  );
}
