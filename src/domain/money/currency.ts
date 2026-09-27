export type CurrencyCode = "INR" | "USD" | "EUR" | "AED" | "SGD";

interface CurrencyInfo {
  code: CurrencyCode;
  locale: string;
  words: { system: "indian" | "international"; major: string; minor: string };
}

/** Adding a currency = adding one entry here (and to CurrencyCode). */
export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  INR: { code: "INR", locale: "en-IN", words: { system: "indian", major: "Rupees", minor: "Paise" } },
  USD: { code: "USD", locale: "en-US", words: { system: "international", major: "US Dollars", minor: "Cents" } },
  EUR: { code: "EUR", locale: "en-IE", words: { system: "international", major: "Euro", minor: "Cents" } },
  AED: { code: "AED", locale: "en-AE", words: { system: "international", major: "UAE Dirhams", minor: "Fils" } },
  SGD: { code: "SGD", locale: "en-SG", words: { system: "international", major: "Singapore Dollars", minor: "Cents" } },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as [CurrencyCode, ...CurrencyCode[]];

export function formatMoney(minor: number, currency: CurrencyCode): string {
  const { locale, code } = CURRENCIES[currency];
  return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(minor / 100);
}

/**
 * "INR 3,38,683.60". For the PDF, which uses the standard Helvetica font:
 * WinAnsi has no ₹ (U+20B9), so the symbol would print as an empty box. The
 * invoices FINCLUST already sends write the code too, so this is faithful.
 */
export function formatMoneyWithCode(minor: number, currency: CurrencyCode): string {
  return `${currency} ${formatAmount(minor, currency)}`;
}

export function formatAmount(minor: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat(CURRENCIES[currency].locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/**
 * Parses what people actually type ("25,00.00", "37,500.", "₹ 3,38,683.6") into
 * minor units. Parsed as a string, never through a float, so the result is
 * exact. Anything ambiguous returns null rather than a guess.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[\s,₹$]/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number((match[2] ?? "").padEnd(2, "0"));
  return major * 100 + minor;
}
