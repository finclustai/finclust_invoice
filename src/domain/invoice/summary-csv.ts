import { stateName } from "./state-codes";
import type { InvoiceStatus } from "./status";

export interface SummaryRow {
  number: string;
  issueDate: string;
  customerName: string;
  customerGstin: string | null;
  /** GST state code, or null for an export. */
  placeOfSupply: string | null;
  currency: string;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
  paidMinor: number;
  status: InvoiceStatus;
}

const HEADER = [
  "Invoice",
  "Date",
  "Customer",
  "GSTIN",
  "Place of supply",
  "Currency",
  "Taxable value",
  "CGST",
  "SGST",
  "IGST",
  "Total",
  "Paid",
  "Status",
];

/** A spreadsheet must read amounts as numbers, so no grouping and no symbol. */
const amount = (minor: number) => (minor / 100).toFixed(2);

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The month's invoices as a spreadsheet, for the accountant who has to file
 * them. Column for column this is what a GSTR-1 return is built from: taxable
 * value, the tax split, and the place of supply that decided that split.
 *
 * Currencies are subtotalled separately. Adding rupees to dollars would
 * produce a number that means nothing and that someone would nonetheless file.
 */
export function buildSummaryCsv(rows: SummaryRow[]): string {
  const lines = [HEADER.join(",")];

  for (const r of rows) {
    lines.push(
      [
        cell(r.number),
        r.issueDate,
        cell(r.customerName),
        cell(r.customerGstin ?? ""),
        cell(r.placeOfSupply ? `${r.placeOfSupply} ${stateName(r.placeOfSupply) ?? ""}`.trim() : "Export"),
        r.currency,
        amount(r.taxableMinor),
        amount(r.cgstMinor),
        amount(r.sgstMinor),
        amount(r.igstMinor),
        amount(r.totalMinor),
        amount(r.paidMinor),
        r.status,
      ].join(","),
    );
  }

  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  if (currencies.length > 1) {
    lines.push("");
    for (const currency of currencies) {
      const inCurrency = rows.filter((r) => r.currency === currency);
      lines.push(
        [
          `${currency} subtotal`,
          "",
          `${inCurrency.length} invoices`,
          "",
          "",
          currency,
          amount(sum(inCurrency, "taxableMinor")),
          amount(sum(inCurrency, "cgstMinor")),
          amount(sum(inCurrency, "sgstMinor")),
          amount(sum(inCurrency, "igstMinor")),
          amount(sum(inCurrency, "totalMinor")),
          amount(sum(inCurrency, "paidMinor")),
          "",
        ].join(","),
      );
    }
  }

  lines.push(
    [
      "Total",
      "",
      `${rows.length} invoices`,
      "",
      "",
      currencies.length === 1 ? (currencies[0] ?? "") : "mixed",
      amount(sum(rows, "taxableMinor")),
      amount(sum(rows, "cgstMinor")),
      amount(sum(rows, "sgstMinor")),
      amount(sum(rows, "igstMinor")),
      amount(sum(rows, "totalMinor")),
      amount(sum(rows, "paidMinor")),
      "",
    ].join(","),
  );

  return lines.join("\n") + "\n";
}

const sum = (rows: SummaryRow[], key: keyof SummaryRow) =>
  rows.reduce((total, r) => total + (r[key] as number), 0);
