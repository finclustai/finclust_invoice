"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { formatAmount, formatMoney, CURRENCY_CODES } from "@/domain/money/currency";
import { archiveCatalogItem, saveCatalogItem, type CatalogFormState } from "./actions";
import type { CatalogItem } from "./queries";

/**
 * The services billed most often, with their usual rate, so a line item is
 * picked rather than retyped. Kept to one page: a list plus one inline form is
 * the whole feature, and a separate add screen would be more steps, not fewer.
 */
export function CatalogPage({ items, canEdit }: { items: CatalogItem[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Catalog</h1>
          <p className="mt-0.5 text-sm text-mid">
            Saved lines with their usual rate. Press <kbd className="font-mono">/</kbd> in an empty
            description on an invoice to pick one.
          </p>
        </div>
        {canEdit && !adding && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            Add item
          </button>
        )}
      </header>

      {adding && <ItemForm onDone={() => setAdding(false)} />}

      {items.length === 0 && !adding ? (
        <div className="card p-8 text-center">
          <h2 className="font-extrabold">Nothing saved yet</h2>
          <p className="mt-1 text-sm text-body">
            Add the services you bill every month and they will be one keystroke away on an invoice.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((i) =>
            editing?.id === i.id ? (
              <li key={i.id}>
                <ItemForm item={i} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={i.id} className="card flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.description}</span>
                  {i.hsnSac && <span className="block font-mono text-xs text-mid">HSN/SAC {i.hsnSac}</span>}
                </span>
                <span className="tnum shrink-0 font-semibold">{formatMoney(i.rateMinor, i.currency)}</span>
                {canEdit && (
                  <span className="flex shrink-0 gap-1">
                    <button className="btn field-sm" onClick={() => setEditing(i)}>
                      Edit
                    </button>
                    <RemoveButton id={i.id} description={i.description} />
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </main>
  );
}

function ItemForm({ item, onDone }: { item?: CatalogItem; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CatalogFormState, FormData>(saveCatalogItem, {});

  useEffect(() => {
    if (state.saved) {
      onDone();
      router.refresh();
    }
  }, [state.saved, onDone, router]);

  return (
    <form action={action} className="card space-y-3 p-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <label className="block">
        <span className="label">Description</span>
        <input
          className="field"
          name="description"
          defaultValue={item?.description}
          placeholder="Oracle OTBI consulting — monthly"
          required
          autoFocus
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">HSN/SAC</span>
          <input className="field font-mono" name="hsnSac" defaultValue={item?.hsnSac ?? ""} placeholder="998314" />
        </label>
        <label className="block">
          <span className="label">Usual rate</span>
          <input
            className="field tnum text-right"
            name="rate"
            defaultValue={item ? formatAmount(item.rateMinor, item.currency) : ""}
            placeholder="75,000"
            required
          />
        </label>
        <label className="block">
          <span className="label">Currency</span>
          <select className="field" name="currency" defaultValue={item?.currency ?? "INR"}>
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.error && (
        <p role="alert" className="error-line">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary field-sm" disabled={pending}>
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {item ? "Save" : "Add"}
        </button>
        <button type="button" className="btn field-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RemoveButton({ id, description }: { id: string; description: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn field-sm"
      aria-label={`Remove ${description}`}
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Remove “${description}” from the catalog?\n\nInvoices that used it are unaffected.`)) return;
        setBusy(true);
        await archiveCatalogItem(id);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}
    </button>
  );
}
