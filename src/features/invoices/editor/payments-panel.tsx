"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { PAYMENT_METHODS, summarisePayments } from "@/domain/invoice/payments";
import { formatMoney, type CurrencyCode } from "@/domain/money/currency";
import { markPaidInFull, recordPayment, removePayment, type PaymentRow } from "../payments";

/**
 * What has been received against this invoice, and what is still owed.
 *
 * Amounts are shown, never inferred: the outstanding figure comes from the
 * payments themselves, so correcting a mistyped payment corrects the balance
 * rather than leaving a total that no longer adds up.
 */
export function PaymentsPanel({
  invoiceId,
  currency,
  totalMinor,
  payments,
  canEdit,
  issued,
}: {
  invoiceId: string;
  currency: CurrencyCode;
  totalMinor: number;
  payments: PaymentRow[];
  canEdit: boolean;
  issued: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const summary = summarisePayments(payments, totalMinor);
  const money = (minor: number) => formatMoney(minor, currency);

  async function run(work: () => Promise<{ ok: boolean; problems?: string[] }>) {
    setBusy(true);
    setProblems([]);
    const result = await work();
    setBusy(false);
    if (result.ok) {
      setAdding(false);
      router.refresh();
    } else {
      setProblems(result.problems ?? ["That didn’t work"]);
    }
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="label mb-0">Payments</h2>
        {summary.isSettled && (
          <span className="chip status-paid">
            <CheckCircle2 size={12} aria-hidden />
            Settled
          </span>
        )}
      </div>

      {!issued ? (
        <p className="text-sm text-mid">Issue the invoice before recording what comes in against it.</p>
      ) : (
        <>
          <dl className="mb-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-body">Received</dt>
              <dd className="tnum">{money(summary.paidMinor)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Still owed</dt>
              <dd className="tnum">{money(summary.outstandingMinor)}</dd>
            </div>
            {summary.overpaidMinor > 0 && (
              <p className="hint">Paid {money(summary.overpaidMinor)} more than the invoice.</p>
            )}
          </dl>

          {payments.length > 0 && (
            <ul className="mb-3 divide-y divide-line border-y border-line">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="text-mid">{p.date}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {p.method}
                    {p.reference && <span className="text-mid"> · {p.reference}</span>}
                  </span>
                  <span className="tnum font-semibold">{money(p.amountMinor)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="text-placeholder hover:text-red"
                      aria-label={`Remove the ${money(p.amountMinor)} payment on ${p.date}`}
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Remove the ${money(p.amountMinor)} payment recorded on ${p.date}?`)) {
                          void run(() => removePayment(p.id));
                        }
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {problems.length > 0 && (
            <div role="alert" className="error-line mb-3 block">
              <ul className="list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {canEdit && !adding && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn field-sm" onClick={() => setAdding(true)} disabled={busy}>
                <Plus size={14} aria-hidden />
                Record a payment
              </button>
              {!summary.isSettled && (
                <button
                  type="button"
                  className="btn field-sm"
                  disabled={busy}
                  onClick={() => void run(() => markPaidInFull(invoiceId))}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                  Paid in full ({money(summary.outstandingMinor)})
                </button>
              )}
            </div>
          )}

          {adding && (
            <PaymentForm
              defaultAmountMinor={summary.outstandingMinor}
              currency={currency}
              busy={busy}
              onCancel={() => setAdding(false)}
              onSubmit={(fields) => void run(() => recordPayment(invoiceId, fields))}
            />
          )}
        </>
      )}
    </section>
  );
}

function PaymentForm({
  defaultAmountMinor,
  currency,
  busy,
  onCancel,
  onSubmit,
}: {
  defaultAmountMinor: number;
  currency: CurrencyCode;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (fields: { date: string; amount: string; method: string; reference: string }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  // Pre-filled with what is owed, because paying the balance is the common case.
  const [amount, setAmount] = useState(defaultAmountMinor > 0 ? String(defaultAmountMinor / 100) : "");
  const [method, setMethod] = useState<string>(currency === "INR" ? "Bank transfer" : "Foreign remittance");
  const [reference, setReference] = useState("");

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Date received</span>
          <input className="field field-sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Amount</span>
          <input
            className="field field-sm tnum text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="75,000"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="label">How</span>
          <select className="field field-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Reference</span>
          <input
            className="field field-sm"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="UTR or cheque number"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary field-sm"
          disabled={busy}
          onClick={() => onSubmit({ date, amount, method, reference })}
        >
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Record it
        </button>
        <button type="button" className="btn field-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
