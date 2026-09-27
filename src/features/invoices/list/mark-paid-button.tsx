"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { markPaidInFull } from "../payments";

/** Settles the balance in one click, for the common case of the money landing
 *  in full. A part payment goes through the invoice's own payments panel. */
export function MarkPaidButton({ id, amount }: { id: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn field-sm whitespace-nowrap"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Record ${amount} received in full today?`)) return;
        setBusy(true);
        const result = await markPaidInFull(id);
        setBusy(false);
        if (!result.ok) alert(result.problems[0] ?? "That didn’t work");
        router.refresh();
      }}
    >
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
      Mark paid
    </button>
  );
}
