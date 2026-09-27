import type { CurrencyCode } from "../money/currency";
import { amountInWords } from "../money/words";

export interface CalcLine {
  description: string;
  qty: number;
  rateMinor: number;
  hsnSac?: string | null;
}

export interface TaxContext {
  currency: CurrencyCode;
  gstEnabled: boolean;
  /** Basis points: 1800 = 18%. */
  taxRateBp: number;
  sellerStateCode: string;
  /** Customer's GST state code; null = outside India (export under LUT). */
  placeOfSupplyStateCode: string | null;
}

export type TaxRegime = "intra" | "inter" | "export" | "none";

export interface TaxLine {
  label: "CGST" | "SGST" | "IGST";
  rateBp: number;
  amountMinor: number;
}

export interface CalculatedInvoice<L extends CalcLine> {
  lines: (L & { amountMinor: number })[];
  subtotalMinor: number;
  regime: TaxRegime;
  taxes: TaxLine[];
  taxMinor: number;
  totalMinor: number;
  totalInWords: string;
}

export function taxRegime(ctx: TaxContext): TaxRegime {
  // Either condition makes it a supply under LUT without payment of IGST. The
  // currency test matters on its own: an overseas customer whose state code was
  // filled in by mistake must not be charged IGST on a dollar invoice.
  if (ctx.currency !== "INR" || ctx.placeOfSupplyStateCode === null) return "export";
  if (!ctx.gstEnabled) return "none";
  return ctx.placeOfSupplyStateCode === ctx.sellerStateCode ? "intra" : "inter";
}

/** Qty is scaled to thousandths first so float noise never reaches the rounding. */
export function lineAmount(qty: number, rateMinor: number): number {
  const qtyMilli = Math.round(qty * 1000);
  return Math.round((qtyMilli * rateMinor) / 1000);
}

const pct = (amount: number, bp: number) => Math.round((amount * bp) / 10_000);

function taxesFor(regime: TaxRegime, subtotal: number, rateBp: number): TaxLine[] {
  if (regime === "inter") return [{ label: "IGST", rateBp, amountMinor: pct(subtotal, rateBp) }];
  if (regime === "intra") {
    const half = rateBp / 2;
    return [
      { label: "CGST", rateBp: half, amountMinor: pct(subtotal, half) },
      { label: "SGST", rateBp: half, amountMinor: pct(subtotal, half) },
    ];
  }
  return [];
}

/**
 * The only place invoice arithmetic happens. The editor, the PDF, the CSV
 * export and the stored totals all call this, so they cannot disagree.
 */
export function calculateInvoice<L extends CalcLine>(lines: L[], ctx: TaxContext): CalculatedInvoice<L> {
  const priced = lines.map((l) => ({ ...l, amountMinor: lineAmount(l.qty, l.rateMinor) }));
  const subtotalMinor = priced.reduce((sum, l) => sum + l.amountMinor, 0);
  const regime = taxRegime(ctx);
  const taxes = taxesFor(regime, subtotalMinor, ctx.taxRateBp);
  const taxMinor = taxes.reduce((sum, t) => sum + t.amountMinor, 0);
  const totalMinor = subtotalMinor + taxMinor;
  return {
    lines: priced,
    subtotalMinor,
    regime,
    taxes,
    taxMinor,
    totalMinor,
    totalInWords: amountInWords(totalMinor, ctx.currency),
  };
}
