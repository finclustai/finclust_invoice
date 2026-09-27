"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FileSpreadsheet, Loader2 } from "lucide-react";
import { buildCaPack, previewPack, type PackPreview } from "../ca-pack";
import { periodLabel } from "../status-style";

/** Everything issued in a month, in one email to whoever files it. */
export function CaPackButton({ period }: { period: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn field-sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet size={15} aria-hidden />
        Send the month
      </button>
      {open && <PackDialog period={period} onClose={() => setOpen(false)} />}
    </>
  );
}

function PackDialog({ period, onClose }: { period: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<PackPreview | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<{ draftsUrl: string; attached: number; skipped: string[] } | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    void previewPack(period).then(setPreview);
  }, [period]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="pack-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) dialog.current?.close();
      }}
      onClick={(e) => e.target === dialog.current && !busy && dialog.current?.close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-[var(--radius-modal)] border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40"
    >
      {done ? (
        <div className="p-6 text-center">
          <CheckCircle2 size={32} className="mx-auto text-green" aria-hidden />
          <h2 className="mt-3 font-extrabold">Draft ready in Zoho Mail</h2>
          <p className="mt-1 text-sm text-body">
            {done.attached} invoice{done.attached === 1 ? "" : "s"} and the summary spreadsheet are
            attached. Read it over and send it from Zoho.
          </p>
          {done.skipped.length > 0 && (
            <p className="hint mt-2">
              {done.skipped.length} were too large to attach and appear in the spreadsheet only.
            </p>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <a className="btn btn-primary field-sm" href={done.draftsUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden />
              Open Zoho drafts
            </a>
            <button className="btn field-sm" onClick={() => dialog.current?.close()}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-line p-4">
            <h2 id="pack-title" className="font-extrabold">
              Send {periodLabel(period)} to your accountant
            </h2>
            <p className="mt-1 text-xs text-mid">
              {preview
                ? `${preview.count} invoice${preview.count === 1 ? "" : "s"}${
                    preview.currencies.length ? ` in ${preview.currencies.join(" and ")}` : ""
                  }, plus a spreadsheet with the taxable value and tax split for each.`
                : "Working out what is in this month…"}
            </p>
          </div>
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="label">To</span>
              <input
                className="field"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="your.accountant@firm.com"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="label">Cc</span>
              <input className="field" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
            </label>
            {problems.length > 0 && (
              <div role="alert" className="error-line block">
                <ul className="list-disc pl-5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-line p-3">
            <button type="button" className="btn field-sm" disabled={busy} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary field-sm"
              disabled={busy || preview?.count === 0 || !preview?.enabled}
              onClick={async () => {
                setBusy(true);
                setProblems([]);
                const result = await buildCaPack(period, { to, cc });
                setBusy(false);
                if (result.ok) setDone({ draftsUrl: result.draftsUrl, attached: result.attached, skipped: result.skipped });
                else setProblems(result.problems);
              }}
            >
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {busy ? "Building…" : "Create the draft"}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
