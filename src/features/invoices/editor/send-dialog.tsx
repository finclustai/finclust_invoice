"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Mail, Send } from "lucide-react";
import type { Audience } from "@/domain/invoice/email";
import { prepareSend, sendInvoice, type SendPrefill } from "../send";

/**
 * One dialog for every recipient: the client who has to pay the invoice and
 * the accountant who has to file it. Only the suggested wording differs — the
 * To line is always typed or picked, so it serves anyone.
 *
 * It creates a Zoho draft rather than sending. The last look before a document
 * reaches a customer should be a person's.
 */
export function SendButton({ invoiceId, disabled }: { invoiceId: string; disabled: boolean }) {
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
        <Mail size={15} aria-hidden />
        Send
      </button>
      {open && <SendDialog invoiceId={invoiceId} onClose={() => setOpen(false)} />}
    </>
  );
}

function SendDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [audience, setAudience] = useState<Audience>("client");
  const [prefill, setPrefill] = useState<SendPrefill | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<{ draftsUrl: string; mailbox: string } | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Re-suggests the wording when the audience changes, but never overwrites
  // something the user has already typed.
  useEffect(() => {
    let live = true;
    void prepareSend(invoiceId, audience).then((p) => {
      if (!live) return;
      setPrefill(p);
      if (edited.current) return;
      setTo(p.to.join(", "));
      setSubject(p.subject);
      setHtml(p.html);
    });
    return () => {
      live = false;
    };
  }, [invoiceId, audience]);

  async function submit() {
    setBusy(true);
    setProblems([]);
    const result = await sendInvoice(invoiceId, { to, cc, subject, html });
    setBusy(false);
    if (result.ok) setDone({ draftsUrl: result.draftsUrl, mailbox: result.mailbox });
    else setProblems(result.problems);
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="send-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) dialog.current?.close();
      }}
      onClick={(e) => e.target === dialog.current && !busy && dialog.current?.close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-[var(--radius-modal)] border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40"
    >
      {done ? (
        <div className="p-6 text-center">
          <CheckCircle2 size={32} className="mx-auto text-green" aria-hidden />
          <h2 className="mt-3 font-extrabold">Draft ready in Zoho Mail</h2>
          <p className="mt-1 text-sm text-body">
            It is waiting in <strong>{done.mailbox}</strong>. Read it over and press send there —
            nothing has gone out yet.
          </p>
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
            <h2 id="send-title" className="font-extrabold">
              Send this invoice
            </h2>
            <p className="mt-1 text-xs text-mid">
              Creates a draft in {prefill?.mailbox ?? "your Zoho mailbox"} with the PDF attached. You
              read it and press send.
            </p>
            <div className="mt-3 flex gap-1">
              {(
                [
                  ["client", "To the customer"],
                  ["accountant", "To the accountant"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${audience === value ? "bg-orange-tint text-ink" : "bg-sand text-body"}`}
                  aria-pressed={audience === value}
                  onClick={() => setAudience(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {prefill && !prefill.enabled && (
            <p className="error-line m-4">
              Email isn’t connected yet. An admin needs to set up the Zoho mailbox.
            </p>
          )}

          <div className="space-y-3 p-4">
            <label className="block">
              <span className="label">To</span>
              <input
                className="field"
                value={to}
                onChange={(e) => {
                  edited.current = true;
                  setTo(e.target.value);
                }}
                placeholder="name@company.com, another@company.com"
              />
              {prefill && prefill.recentRecipients.length > 0 && (
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {prefill.recentRecipients.map((address) => (
                    <button
                      key={address}
                      type="button"
                      className="chip bg-sand text-body"
                      onClick={() => {
                        edited.current = true;
                        setTo((current) => (current.includes(address) ? current : [current, address].filter(Boolean).join(", ")));
                      }}
                    >
                      {address}
                    </button>
                  ))}
                </span>
              )}
            </label>

            <label className="block">
              <span className="label">Cc</span>
              <input className="field" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
            </label>

            <label className="block">
              <span className="label">Subject</span>
              <input
                className="field"
                value={subject}
                onChange={(e) => {
                  edited.current = true;
                  setSubject(e.target.value);
                }}
              />
            </label>

            <label className="block">
              <span className="label">Message</span>
              <textarea
                className="field min-h-36 font-mono text-xs"
                rows={8}
                value={html}
                onChange={(e) => {
                  edited.current = true;
                  setHtml(e.target.value);
                }}
              />
              <span className="hint">Simple HTML. You can edit it again in Zoho before sending.</span>
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
              disabled={busy || !prefill?.enabled}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
              {busy ? "Preparing…" : "Create the draft"}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
