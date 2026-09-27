"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Loader2, ShieldOff } from "lucide-react";
import { revokeShareLink, shareInvoice, type ShareLink } from "../share";

/**
 * Turns the invoice into a link the customer can open from WhatsApp without
 * signing in. The link is the only thing protecting the document, so the
 * dialog says so plainly and offers to revoke it.
 */
export function ShareButton({
  invoiceId,
  links,
  disabled,
}: {
  invoiceId: string;
  links: ShareLink[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn field-sm"
        disabled={disabled}
        title={disabled ? "Issue the invoice first" : undefined}
        onClick={() => setOpen(true)}
      >
        <Link2 size={15} aria-hidden />
        Share
      </button>
      {open && <ShareDialog invoiceId={invoiceId} links={links} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({
  invoiceId,
  links,
  onClose,
}: {
  invoiceId: string;
  links: ShareLink[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ url: string; whatsappUrl: string | null; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function create() {
    setBusy(true);
    setProblems([]);
    const result = await shareInvoice(invoiceId);
    setBusy(false);
    if (result.ok) setMade({ url: result.url, whatsappUrl: result.whatsappUrl, message: result.message });
    else setProblems(result.problems);
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="share-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) dialog.current?.close();
      }}
      onClick={(e) => e.target === dialog.current && !busy && dialog.current?.close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-[var(--radius-modal)] border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40"
    >
      <div className="border-b border-line p-4">
        <h2 id="share-title" className="font-extrabold">
          Share on WhatsApp
        </h2>
        <p className="mt-1 text-xs text-mid">
          Makes a link that opens this invoice as a PDF, with no sign-in. Anyone holding the link can
          read it, so treat it like the PDF itself — you can revoke it at any time.
        </p>
      </div>

      <div className="space-y-3 p-4">
        {made ? (
          <>
            <label className="block">
              <span className="label">Link</span>
              <span className="flex gap-2">
                <input className="field field-sm font-mono text-xs" readOnly value={made.url} />
                <button
                  type="button"
                  className="btn field-sm shrink-0"
                  onClick={async () => {
                    await navigator.clipboard.writeText(made.url).catch(() => undefined);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </span>
            </label>

            {made.whatsappUrl ? (
              <a className="btn btn-primary w-full" href={made.whatsappUrl} target="_blank" rel="noreferrer">
                Open WhatsApp with the message ready
              </a>
            ) : (
              <p className="hint">
                No phone number saved for this customer — copy the link above, or add their number on
                the customer page to open WhatsApp directly.
              </p>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void create()}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Link2 size={15} aria-hidden />}
            {busy ? "Preparing the PDF…" : "Create a link"}
          </button>
        )}

        {problems.length > 0 && (
          <div role="alert" className="error-line block">
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {links.length > 0 && (
          <div className="border-t border-line pt-3">
            <h3 className="label">Links already made</h3>
            <ul className="space-y-1.5">
              {links.map((l) => (
                <li key={l.token} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-mid">…{l.token.slice(-8)}</span>
                  <span className="text-mid">
                    {l.openCount} {l.openCount === 1 ? "open" : "opens"}
                  </span>
                  {l.revoked ? (
                    <span className="chip status-cancelled ml-auto">Revoked</span>
                  ) : (
                    <button
                      type="button"
                      className="btn field-sm ml-auto"
                      onClick={async () => {
                        if (!confirm("Revoke this link? Anyone who already has it will get an error.")) return;
                        await revokeShareLink(l.token);
                        window.location.reload();
                      }}
                    >
                      <ShieldOff size={12} aria-hidden />
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-line p-3">
        <button type="button" className="btn field-sm" disabled={busy} onClick={() => dialog.current?.close()}>
          Done
        </button>
      </div>
    </dialog>
  );
}
