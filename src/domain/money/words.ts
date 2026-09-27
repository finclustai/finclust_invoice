import { CURRENCIES, type CurrencyCode } from "./currency";

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const SCALES = {
  indian: [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
  ],
  international: [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ],
} as const;

function below1000(n: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) words.push(`${ONES[hundreds]} Hundred`);
  if (rest >= 20) words.push(TENS[Math.floor(rest / 10)]! + (rest % 10 ? ` ${ONES[rest % 10]}` : ""));
  else if (rest) words.push(ONES[rest]!);
  return words.join(" ");
}

export function integerToWords(n: number, system: "indian" | "international"): string {
  // Without this a negative recurses forever: Math.floor(-1 / 1e7) is -1, which
  // is truthy, and the remainder never shrinks. A fraction silently returns "".
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`Expected a non-negative whole number, got ${n}`);
  }
  if (n === 0) return "Zero";
  const parts: string[] = [];
  let remaining = n;
  for (const [value, name] of SCALES[system]) {
    const count = Math.floor(remaining / value);
    if (count) {
      // Recurse: the top scale can exceed 999 (e.g. 150 Crore).
      parts.push(`${integerToWords(count, system)} ${name}`);
      remaining %= value;
    }
  }
  if (remaining) parts.push(below1000(remaining));
  return parts.join(" ");
}

export function amountInWords(minor: number, currency: CurrencyCode): string {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new RangeError(`Expected a non-negative whole number of minor units, got ${minor}`);
  }
  const { system, major, minor: minorName } = CURRENCIES[currency].words;
  const whole = Math.floor(minor / 100);
  const fraction = minor % 100;
  const fractionWords = fraction ? ` and ${integerToWords(fraction, system)} ${minorName}` : "";
  return `${major} ${integerToWords(whole, system)}${fractionWords} Only`;
}
