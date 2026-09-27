"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";
import { createDraftInvoice } from "../actions";

/**
 * Creating an invoice writes a row and fetches a page, which takes a moment.
 * Without saying so the button looked broken and got clicked again — and two
 * clicks are two invoices.
 *
 * The form still points straight at the server action rather than at a
 * function that calls it: that is what keeps the button working when
 * JavaScript has not loaded yet. useFormStatus reads the pending state of the
 * form it sits inside, so the label can change without taking that away.
 */
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? (
        <Loader2 size={16} strokeWidth={2.5} className="animate-spin" aria-hidden />
      ) : (
        <Plus size={16} strokeWidth={2.5} aria-hidden />
      )}
      {pending ? "Opening…" : "New invoice"}
    </button>
  );
}

export function NewInvoiceButton() {
  return (
    <form action={createDraftInvoice}>
      <Submit />
    </form>
  );
}
