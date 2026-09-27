"use client";

import { useState } from "react";
import { Ban, Loader2, Trash2 } from "lucide-react";
import { cancelInvoice, deleteInvoice } from "../actions";

/**
 * A draft is deleted; an issued invoice is cancelled.
 *
 * The difference is not fussiness. An issued invoice holds a number in the GST
 * series, and a missing number is the first thing an assessing officer asks
 * about — so it is voided in place rather than removed.
 */
export function DeleteButton({ invoiceId, isDraft, number }: { invoiceId: string; isDraft: boolean; number: string }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    const question = isDraft
      ? "Delete this draft? It has no invoice number, so nothing is left behind."
      : `Cancel invoice ${number}?\n\nIt keeps its number so the series has no gap, and stays readable — but it can't be edited again.`;
    if (!confirm(question)) return;

    setBusy(true);
    const result = isDraft ? await deleteInvoice(invoiceId) : await cancelInvoice(invoiceId);
    setBusy(false);
    if (!result.ok) {
      alert(result.problems[0] ?? "That didn't work");
      return;
    }
    window.location.href = isDraft ? "/invoices" : `/invoices/${invoiceId}`;
  }

  return (
    <button type="button" className="btn field-sm" disabled={busy} onClick={() => void run()}>
      {busy ? (
        <Loader2 size={15} className="animate-spin" aria-hidden />
      ) : isDraft ? (
        <Trash2 size={15} aria-hidden />
      ) : (
        <Ban size={15} aria-hidden />
      )}
      {isDraft ? "Delete" : "Cancel invoice"}
    </button>
  );
}
