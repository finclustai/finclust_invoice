import type { CalculatedInvoice } from "@/domain/invoice/calculate";
import type { CustomerSnapshot, InvoiceDraft, InvoiceLine } from "@/domain/invoice/schema";
import type { InvoiceState } from "@/domain/invoice/status";
import type { CurrencyCode } from "@/domain/money/currency";
import { fromMinor, fromQtyMilli, toMinor, toQtyMilli } from "@/domain/money/bigint";
import { periodOf } from "@/domain/invoice/numbering";

/** The shape Prisma returns for an invoice with its lines. */
export interface InvoiceRow {
  id: string;
  number: string;
  state: InvoiceState;
  version: number;
  companyId: string;
  customerId: string | null;
  customerSnapshot: unknown;
  issueDate: Date;
  dueDate: Date | null;
  paymentTerms: string | null;
  currency: string;
  template: string;
  gstEnabled: boolean;
  taxRateBp: number;
  notes: string | null;
  lines: {
    id: string;
    position: number;
    description: string;
    hsnSac: string | null;
    qtyMilli: number;
    rateMinor: bigint;
    amountMinor: bigint;
  }[];
}

export interface InvoiceRowWrite {
  /** Always re-derived from issueDate, so moving the date moves the month. */
  period: string;
  customerId: string | null;
  customerSnapshot: CustomerSnapshot;
  issueDate: Date;
  dueDate: Date | null;
  paymentTerms: string | null;
  currency: string;
  template: string;
  gstEnabled: boolean;
  taxRateBp: number;
  notes: string | null;
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  lines: {
    id: string;
    position: number;
    description: string;
    hsnSac: string | null;
    qtyMilli: number;
    rateMinor: bigint;
    amountMinor: bigint;
  }[];
}

/**
 * A `@db.Date` column comes back as UTC midnight. Formatting it with anything
 * local-time shifts it a day west of UTC, which would silently change an
 * invoice's date and therefore its number's period.
 */
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export function rowToDraft(row: InvoiceRow): {
  draft: InvoiceDraft;
  number: string;
  state: InvoiceState;
  version: number;
} {
  return {
    number: row.number,
    state: row.state,
    version: row.version,
    draft: {
      companyId: row.companyId,
      customerId: row.customerId,
      // Deliberately the stored snapshot, not a join: editing a customer must
      // never rewrite an invoice that has already gone out.
      customer: row.customerSnapshot as CustomerSnapshot,
      issueDate: isoDate(row.issueDate),
      dueDate: row.dueDate ? isoDate(row.dueDate) : null,
      paymentTerms: row.paymentTerms,
      currency: row.currency as CurrencyCode,
      gstEnabled: row.gstEnabled,
      taxRateBp: row.taxRateBp,
      template: row.template,
      notes: row.notes,
      lines: [...row.lines]
        .sort((a, b) => a.position - b.position)
        .map((l) => ({
          id: l.id,
          description: l.description,
          hsnSac: l.hsnSac,
          qty: fromQtyMilli(l.qtyMilli),
          rateMinor: fromMinor(l.rateMinor),
        })),
    },
  };
}

/**
 * Takes the already-computed totals rather than the draft alone, so this
 * function has no way to invent an amount that disagrees with the invoice.
 */
export function draftToRow(
  draft: InvoiceDraft,
  calc: CalculatedInvoice<InvoiceLine>,
): InvoiceRowWrite {
  return {
    period: periodOf(draft.issueDate),
    customerId: draft.customerId,
    customerSnapshot: draft.customer,
    issueDate: new Date(`${draft.issueDate}T00:00:00.000Z`),
    dueDate: draft.dueDate ? new Date(`${draft.dueDate}T00:00:00.000Z`) : null,
    paymentTerms: draft.paymentTerms,
    currency: draft.currency,
    template: draft.template,
    gstEnabled: draft.gstEnabled,
    taxRateBp: draft.taxRateBp,
    notes: draft.notes,
    subtotalMinor: toMinor(calc.subtotalMinor),
    taxMinor: toMinor(calc.taxMinor),
    totalMinor: toMinor(calc.totalMinor),
    lines: calc.lines.map((l, position) => ({
      id: l.id,
      position,
      description: l.description,
      hsnSac: l.hsnSac ?? null,
      qtyMilli: toQtyMilli(l.qty),
      rateMinor: toMinor(l.rateMinor),
      amountMinor: toMinor(l.amountMinor),
    })),
  };
}
