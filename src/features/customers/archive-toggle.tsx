"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { setCustomerArchived } from "./actions";

/**
 * Archive rather than delete: invoices keep their own copy of the details, but
 * the row is still what links an invoice back to "everything for this client",
 * and deleting it would break that for good.
 */
export function ArchiveToggle({
  id,
  archived,
  invoiceCount,
}: {
  id: string;
  archived: boolean;
  invoiceCount: number;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (
      !archived &&
      !confirm(
        `Archive this customer?\n\nThey stop appearing when you pick a customer on an invoice. ${
          invoiceCount > 0
            ? `Their ${invoiceCount} existing invoice${invoiceCount === 1 ? "" : "s"} stay exactly as they are.`
            : ""
        }`,
      )
    ) {
      return;
    }
    setBusy(true);
    await setCustomerArchived(id, !archived);
    setBusy(false);
    window.location.reload();
  }

  return (
    <div className="mt-8 border-t border-line pt-4">
      <button type="button" className="btn field-sm" onClick={() => void toggle()} disabled={busy}>
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : archived ? (
          <ArchiveRestore size={14} aria-hidden />
        ) : (
          <Archive size={14} aria-hidden />
        )}
        {archived ? "Restore customer" : "Archive customer"}
      </button>
      <p className="hint">
        {archived
          ? "Archived customers don’t show up when you pick a customer on an invoice."
          : "Nothing is ever deleted — archiving only hides them from the picker."}
      </p>
    </div>
  );
}
