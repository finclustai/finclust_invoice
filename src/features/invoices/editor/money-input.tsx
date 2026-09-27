"use client";

import { useState } from "react";
import { formatAmount, parseMoney, type CurrencyCode } from "@/domain/money/currency";

/**
 * Money, in minor units, edited as text.
 *
 * Shows the raw string while focused so a half-typed "1500." is not fought
 * with, and the grouped form when not, so a column of amounts is scannable.
 *
 * Unparseable input keeps the previous value rather than storing a wrong
 * number — and says so. Reverting silently would be the same invisible wrong
 * amount this whole app exists to prevent: the person believes they changed
 * the rate, and the PDF goes out with the old one.
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
  const [rejected, setRejected] = useState<string | null>(null);

  const display = editing ?? (valueMinor === 0 ? "" : formatAmount(valueMinor, currency));
  const hintId = rejected ? `${ariaLabel ?? "money"}-hint`.replace(/\s+/g, "-") : undefined;

  return (
    <span className="block">
      <input
        className={`field field-sm tnum w-full text-right ${rejected ? "border-red" : ""} ${className}`}
        type="text"
        inputMode="decimal"
        value={display}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={rejected ? true : undefined}
        aria-describedby={hintId}
        onFocus={() => {
          setEditing(valueMinor === 0 ? "" : String(valueMinor / 100));
          setRejected(null);
        }}
        onChange={(e) => {
          setEditing(e.target.value);
          setRejected(null);
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
            // Deliberately NOT cleared by an effect: the message has to survive
            // the blur that produced it, or the revert is silent.
            setRejected(raw);
            return;
          }
          onChange(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setEditing(null);
            setRejected(null);
            e.currentTarget.blur();
          }
        }}
      />
      {rejected && (
        <span id={hintId} role="alert" className="hint block text-right text-red">
          “{rejected}” isn’t an amount — kept {formatAmount(valueMinor, currency)}
        </span>
      )}
    </span>
  );
}
