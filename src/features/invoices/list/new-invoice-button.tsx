"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createDraftInvoice } from "../actions";

/**
 * Creating an invoice takes a moment: a row is written and a page is fetched.
 * Without saying so, the button looked broken and people clicked it twice —
 * which is two invoices. It disables itself and says what it is doing.
 */
export function NewInvoiceButton() {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async () => {
        setBusy(true);
        await createDraftInvoice();
      }}
    >
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? (
          <Loader2 size={16} strokeWidth={2.5} className="animate-spin" aria-hidden />
        ) : (
          <Plus size={16} strokeWidth={2.5} aria-hidden />
        )}
        {busy ? "Opening…" : "New invoice"}
      </button>
    </form>
  );
}
