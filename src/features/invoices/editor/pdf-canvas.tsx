"use client";

import { useEffect, useRef, useState } from "react";
import { usePDF } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/pdf/invoice-document";
import type { InvoiceDocumentProps } from "@/pdf/props";

const RERENDER_MS = 400;

/**
 * The live preview. Renders the very same component the download route uses,
 * so the file someone receives cannot differ from what they approved here.
 *
 * The previous page stays on screen while the next one renders — re-rendering
 * a PDF on every keystroke would otherwise flash white continuously.
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
  const shown = useRef<string | null>(null);

  useEffect(() => {
    update(<InvoiceDocument doc={settled} />);
  }, [settled, update]);

  if (instance.url) shown.current = instance.url;

  if (instance.error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <p className="error-line">Could not draw the preview. The invoice itself is safe — try reloading.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-sand">
      {shown.current ? (
        <iframe
          // #toolbar=0 hides the browser viewer's chrome, so the page itself is the frame.
          src={`${shown.current}#toolbar=0&navpanes=0&view=FitH`}
          title="Invoice preview"
          className="h-full w-full border-0"
        />
      ) : (
        <div className="grid h-full place-items-center text-sm text-mid">Drawing the invoice…</div>
      )}
      {instance.loading && shown.current && (
        <span className="absolute top-3 right-3 rounded-full bg-paper/90 px-2 py-0.5 text-xs text-mid shadow-soft">
          updating…
        </span>
      )}
    </div>
  );
}
