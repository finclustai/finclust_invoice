"use client";

import { useEffect, useState } from "react";
import { formatAmount, parseMoney, type CurrencyCode } from "@/domain/money/currency";

/**
 * Money, in minor units, edited as text.
 *
 * Shows the raw string while focused so a half-typed "1500." is not fought
 * with, and the grouped form when not, so a column of amounts is scannable.
 * Unparseable input reverts to the last good value rather than storing a
 * wrong number — that is the failure this whole app exists to prevent.
 */
export function MoneyInput({
  valueMinor,
  currency,
  onChange,
  disabled,
  className = "",
  "aria-label": ariaLabel,
}: {
  valueMinor: number;
  currency: CurrencyCode;
  onChange: (minor: number) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  // Keep in step when the value changes elsewhere (a template switch, a restore).
  useEffect(() => {
    if (editing === null) setRejected(false);
  }, [valueMinor, editing]);

  const display = editing ?? (valueMinor === 0 ? "" : formatAmount(valueMinor, currency));

  return (
    <input
      className={`field field-sm tnum text-right ${rejected ? "border-red" : ""} ${className}`}
      type="text"
      inputMode="decimal"
      value={display}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={rejected || undefined}
      onFocus={() => setEditing(valueMinor === 0 ? "" : String(valueMinor / 100))}
      onChange={(e) => {
        setEditing(e.target.value);
        setRejected(false);
      }}
      onBlur={() => {
        const raw = (editing ?? "").trim();
        setEditing(null);
        if (raw === "") {
          onChange(0);
          return;
        }
        const parsed = parseMoney(raw);
        if (parsed === null) {
          setRejected(true); // keep the previous value rather than guessing
          return;
        }
        onChange(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setEditing(null);
          setRejected(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
