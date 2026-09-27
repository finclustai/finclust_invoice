"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { duplicateInvoice } from "../actions";
import { bumpMonth } from "../bump-month";

/**
 * Repeating last month's invoice is the monthly job, so this is one click plus
 * one decision: whether the month names in the line descriptions should move
 * on. That is a guess about prose, so it is shown as a preview and ticked by
 * the user rather than applied quietly.
 */
export function DuplicateButton({ descriptions }: { descriptions: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn field-sm" onClick={() => setOpen(true)}>
        <Copy size={15} aria-hidden />
        Duplicate
      </button>
      {open && <DuplicateDialog descriptions={descriptions} onClose={() => setOpen(false)} />}
    </>
  );
}

function DuplicateDialog({ descriptions, onClose }: { descriptions: string[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [bump, setBump] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const changed = descriptions.filter((d) => bumpMonth(d) !== d);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="dup-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) dialog.current?.close();
      }}
      onClick={(e) => e.target === dialog.current && !busy && dialog.current?.close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-[var(--radius-modal)] border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40"
    >
      <form
        action={async () => {
          setBusy(true);
          await duplicateInvoice(
            window.location.pathname.split("/")[2]!,
            { bumpMonths: bump },
          );
        }}
      >
        <div className="border-b border-line p-4">
          <h2 id="dup-title" className="font-extrabold">
            Duplicate this invoice
          </h2>
          <p className="mt-1 text-sm text-body">
            A new draft with the same customer and the same lines, dated today. It takes no invoice
            number until you issue it.
          </p>
        </div>

        {changed.length > 0 && (
          <div className="border-b border-line p-4">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={bump}
                onChange={(e) => setBump(e.target.checked)}
              />
              <span>
                <span className="font-semibold">Move the month names on</span>
                <span className="mt-1 block text-xs text-mid">
                  {changed.length} line{changed.length === 1 ? "" : "s"} mention a month. Check the
                  suggestion below before using it.
                </span>
              </span>
            </label>
            {bump && (
              <ul className="mt-3 space-y-1 text-xs">
                {changed.slice(0, 4).map((d) => (
                  <li key={d} className="truncate">
                    <span className="text-mid line-through">{d}</span>
                    <span className="text-mid"> → </span>
                    <span className="font-semibold">{bumpMonth(d)}</span>
                  </li>
                ))}
                {changed.length > 4 && <li className="text-mid">and {changed.length - 4} more</li>}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 p-3">
          <button type="button" className="btn field-sm" disabled={busy} onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button className="btn btn-primary field-sm" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Copy size={14} aria-hidden />}
            {busy ? "Creating…" : "Create the copy"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
