"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Download, Loader2, Send } from "lucide-react";
import { calculateInvoice } from "@/domain/invoice/calculate";
import type { InvoiceDraft } from "@/domain/invoice/schema";
import type { InvoiceState } from "@/domain/invoice/status";
import { formatMoney } from "@/domain/money/currency";
import { CURRENCY_CODES, type CurrencyCode } from "@/domain/money/currency";
import { buildDocumentProps, type CompanyForPdf } from "@/pdf/props";
import { issueInvoice, saveDraft } from "../actions";
import { CustomerPicker, snapshotOf, type PickableCustomer } from "./customer-picker";
import { LineGrid } from "./line-grid";
import { useAutosave } from "./use-autosave";

// @react-pdf is large and browser-only; keep it off every other route.
const PdfCanvas = dynamic(() => import("./pdf-canvas"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center bg-sand text-sm text-mid">Loading preview…</div>,
});

export function InvoiceEditor({
  id,
  number,
  state,
  version,
  initialDraft,
  company,
  customers,
  canEdit,
}: {
  id: string;
  number: string;
  state: InvoiceState;
  version: number;
  initialDraft: InvoiceDraft;
  company: CompanyForPdf;
  customers: PickableCustomer[];
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [issuing, setIssuing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  // Every total on the screen and in the PDF comes from here. Nothing is typed.
  const calc = useMemo(
    () =>
      calculateInvoice(draft.lines, {
        currency: draft.currency,
        gstEnabled: draft.gstEnabled,
        taxRateBp: draft.taxRateBp,
        sellerStateCode: company.stateCode,
        placeOfSupplyStateCode: draft.customer.stateCode,
      }),
    [draft, company.stateCode],
  );

  const docProps = useMemo(
    () => buildDocumentProps(draft, company, number, state),
    [draft, company, number, state],
  );

  const save = useAutosave(draft, version, { enabled: canEdit, save: (d, v) => saveDraft(id, v, d) });
  const patch = (p: Partial<InvoiceDraft>) => setDraft((d) => ({ ...d, ...p }));

  async function onIssue() {
    setIssuing(true);
    setProblems([]);
    const result = await issueInvoice(id, version, draft);
    setIssuing(false);
    if (result.ok) window.location.reload();
    else setProblems(result.problems);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-paper px-4 py-2.5">
        <Link href="/invoices" className="btn field-sm" aria-label="Back to invoices">
          <ArrowLeft size={15} aria-hidden />
        </Link>
        <span className="font-mono text-sm font-bold">{number}</span>
        <SaveIndicator state={save} />

        <div className="ml-auto flex items-center gap-2">
          <a className="btn field-sm" href={`/invoices/${id}/pdf`}>
            <Download size={15} aria-hidden />
            Download
          </a>
          {canEdit && state === "DRAFT" && (
            <button className="btn btn-primary field-sm" onClick={onIssue} disabled={issuing}>
              {issuing ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}
              {issuing ? "Issuing…" : "Issue"}
            </button>
          )}
        </div>
      </header>

      {save.status === "conflict" && (
        <p role="alert" className="error-line m-3">
          <AlertCircle size={15} aria-hidden />
          {save.message}
          <button className="btn field-sm ml-auto" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="error-line m-3 block">
          <p className="font-semibold">This invoice isn’t ready to issue:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {!canEdit && (
        <p className="m-3 rounded-[var(--radius-input)] bg-sand px-3 py-2 text-sm text-mid">
          {state === "CANCELLED" ? "This invoice is cancelled and can’t be edited." : "You have read-only access."}
        </p>
      )}

      {/* One column with a tab switch on a phone, two side by side above lg. */}
      <div className="flex gap-1 border-b border-line px-3 py-1.5 lg:hidden">
        {(["edit", "preview"] as const).map((t) => (
          <button
            key={t}
            className={`chip ${tab === t ? "bg-orange-tint text-ink" : "bg-sand text-body"}`}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {t === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
        <div className={`min-h-0 overflow-y-auto p-4 ${tab === "edit" ? "" : "hidden lg:block"}`}>
          <Form
            draft={draft}
            calc={calc}
            customers={customers}
            disabled={!canEdit}
            showHsn={docProps.showHsnColumn}
            patch={patch}
            setDraft={setDraft}
          />
        </div>
        <div className={`min-h-0 border-line lg:border-l ${tab === "preview" ? "" : "hidden lg:block"}`}>
          <PdfCanvas doc={docProps} />
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: ReturnType<typeof useAutosave> }) {
  if (state.status === "saving")
    return (
      <span className="flex items-center gap-1.5 text-xs text-mid">
        <Loader2 size={13} className="animate-spin" aria-hidden />
        Saving…
      </span>
    );
  if (state.status === "saved")
    return (
      <span className="flex items-center gap-1.5 text-xs text-green">
        <Check size={13} strokeWidth={3} aria-hidden />
        Saved
      </span>
    );
  if (state.status === "error")
    return (
      <button className="flex items-center gap-1.5 text-xs text-red" onClick={state.retry}>
        <AlertCircle size={13} aria-hidden />
        {state.message} — retry
      </button>
    );
  return null;
}

function Form({
  draft,
  calc,
  customers,
  disabled,
  showHsn,
  patch,
  setDraft,
}: {
  draft: InvoiceDraft;
  calc: ReturnType<typeof calculateInvoice<InvoiceDraft["lines"][number]>>;
  customers: PickableCustomer[];
  disabled: boolean;
  showHsn: boolean;
  patch: (p: Partial<InvoiceDraft>) => void;
  setDraft: React.Dispatch<React.SetStateAction<InvoiceDraft>>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="card p-4">
        <h2 className="label">Bill to</h2>
        <CustomerPicker
          customers={customers}
          selected={draft.customer}
          disabled={disabled}
          onPick={(c) => patch(snapshotOf(c))}
        />
        {draft.customer.name && (
          <div className="mt-3 space-y-1 text-sm text-body">
            {draft.customer.addressLines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            {draft.customer.gstin && <p className="font-mono text-xs">GST: {draft.customer.gstin}</p>}
          </div>
        )}
      </section>

      <section className="card grid gap-4 p-4 sm:grid-cols-3">
        <label>
          <span className="label">Invoice date</span>
          <input
            className="field"
            type="date"
            value={draft.issueDate}
            disabled={disabled}
            onChange={(e) => e.target.value && patch({ issueDate: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Due date</span>
          <input
            className="field"
            type="date"
            value={draft.dueDate ?? ""}
            min={draft.issueDate}
            disabled={disabled}
            onChange={(e) => patch({ dueDate: e.target.value || null })}
          />
          <span className="hint">Optional</span>
        </label>
        <label>
          <span className="label">Currency</span>
          <select
            className="field"
            value={draft.currency}
            disabled={disabled}
            onChange={(e) => patch({ currency: e.target.value as CurrencyCode })}
          >
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label mb-0">Line items</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.gstEnabled}
              disabled={disabled || draft.currency !== "INR"}
              onChange={(e) => patch({ gstEnabled: e.target.checked })}
            />
            GST
            {draft.gstEnabled && draft.currency === "INR" && (
              <input
                className="field field-sm tnum w-16 text-right"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={draft.taxRateBp / 100}
                disabled={disabled}
                aria-label="GST rate percent"
                onChange={(e) => patch({ taxRateBp: Math.round(Number(e.target.value) * 100) })}
              />
            )}
            {draft.gstEnabled && draft.currency === "INR" && <span className="text-mid">%</span>}
          </label>
        </div>

        <LineGrid
          lines={draft.lines}
          calc={calc}
          currency={draft.currency}
          showHsn={showHsn}
          disabled={disabled}
          onChange={(lines) => setDraft((d) => ({ ...d, lines }))}
        />

        <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <Total label="Subtotal" value={formatMoney(calc.subtotalMinor, draft.currency)} />
          {calc.taxes.map((t) => (
            <Total key={t.label} label={`${t.label} @ ${t.rateBp / 100}%`} value={formatMoney(t.amountMinor, draft.currency)} />
          ))}
          {calc.regime === "export" && (
            <p className="text-xs text-mid italic">Export under LUT — no GST charged.</p>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold">
            <dt>Balance due</dt>
            <dd className="tnum">{formatMoney(calc.totalMinor, draft.currency)}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-4">
        <label>
          <span className="label">Notes</span>
          <textarea
            className="field min-h-20"
            rows={3}
            value={draft.notes ?? ""}
            disabled={disabled}
            placeholder="Anything that should appear on the invoice"
            onChange={(e) => patch({ notes: e.target.value || null })}
          />
        </label>
      </section>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-body">{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}
