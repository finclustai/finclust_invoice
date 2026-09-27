"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserRound } from "lucide-react";
import type { CustomerSnapshot } from "@/domain/invoice/schema";
import type { CurrencyCode } from "@/domain/money/currency";

export interface PickableCustomer {
  id: string;
  name: string;
  addressLines: string[];
  gstin: string | null;
  stateCode: string | null;
  emails: string[];
  currency: string;
}

export function CustomerPicker({
  customers,
  selected,
  disabled,
  onPick,
}: {
  customers: PickableCustomer[];
  selected: CustomerSnapshot;
  disabled: boolean;
  onPick: (customer: PickableCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn w-full justify-start"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <UserRound size={16} aria-hidden />
        {selected.name || <span className="text-placeholder">Choose a customer…</span>}
      </button>
      {open && <PickerDialog customers={customers} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  );
}

function PickerDialog({
  customers,
  onPick,
  onClose,
}: {
  customers: PickableCustomer[];
  onPick: (c: PickableCustomer) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  // A native <dialog> gives focus containment, Escape and an inert background
  // without a focus-trap library.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? customers.filter(
        (c) => c.name.toLowerCase().includes(needle) || (c.gstin ?? "").toLowerCase().includes(needle),
      )
    : customers;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="picker-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        dialog.current?.close();
      }}
      // A click on the dimmed backdrop lands on the dialog element itself.
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-[var(--radius-modal)] border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40"
    >
      <div className="border-b border-line p-4">
        <h2 id="picker-title" className="mb-3 font-extrabold">
          Choose a customer
        </h2>
        <div className="relative">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-placeholder" aria-hidden />
          <input
            className="field pl-9"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or GSTIN"
            aria-label="Search customers"
          />
        </div>
      </div>

      <ul className="max-h-[50vh] overflow-y-auto">
        {matches.length === 0 && (
          <li className="p-6 text-center text-sm text-mid">
            No customer matches “{query}”. You can type the details straight onto the invoice instead.
          </li>
        )}
        {matches.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="w-full border-b border-line px-4 py-3 text-left last:border-0 hover:bg-sand"
              onClick={() => {
                onPick(c);
                dialog.current?.close();
              }}
            >
              <span className="block font-semibold">{c.name}</span>
              <span className="block truncate text-xs text-mid">
                {[c.gstin, c.addressLines[0], c.currency].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-line p-3">
        <p className="text-xs text-mid">
          Copied onto this invoice. Editing the customer later won’t change it.
        </p>
        <button type="button" className="btn field-sm" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

/** What gets frozen onto the invoice when a customer is chosen. */
export function snapshotOf(c: PickableCustomer): {
  customer: CustomerSnapshot;
  customerId: string;
  currency: CurrencyCode;
} {
  return {
    customerId: c.id,
    currency: (c.currency === "USD" ? "USD" : "INR") as CurrencyCode,
    customer: {
      name: c.name,
      addressLines: c.addressLines,
      gstin: c.gstin,
      stateCode: c.stateCode,
      emails: c.emails,
    },
  };
}
