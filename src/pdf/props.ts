import { calculateInvoice, type CalculatedInvoice } from "@/domain/invoice/calculate";
import type { InvoiceDraft, InvoiceLine } from "@/domain/invoice/schema";
import type { InvoiceState } from "@/domain/invoice/status";
import type { CurrencyCode } from "@/domain/money/currency";

/** The seller fields the invoice prints. */
export interface CompanyForPdf {
  name: string;
  addressLines: string[];
  email: string | null;
  phone: string | null;
  gstin: string | null;
  stateCode: string;
  lut: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
}

export interface InvoiceDocumentProps {
  /** The GST number once issued; "Draft" before that. */
  number: string;
  isDraft: boolean;
  seller: CompanyForPdf;
  customer: InvoiceDraft["customer"];
  issueDateLabel: string;
  dueDateLabel: string | null;
  paymentTerms: string | null;
  currency: CurrencyCode;
  notes: string | null;
  calc: CalculatedInvoice<InvoiceLine>;
  /** Dropped entirely when no line carries a code, so simple invoices stay clean. */
  showHsnColumn: boolean;
  /** Export under LUT: print the declaration and the LUT number. */
  showLut: boolean;
}

// "August 1, 2026" — how the existing invoices read. Built from the ISO parts
// rather than a Date, so no timezone can shift the day.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export function buildDocumentProps(
  draft: InvoiceDraft,
  company: CompanyForPdf,
  number: string,
  state: InvoiceState,
): InvoiceDocumentProps {
  const calc = calculateInvoice(draft.lines, {
    currency: draft.currency,
    gstEnabled: draft.gstEnabled,
    taxRateBp: draft.taxRateBp,
    sellerStateCode: company.stateCode,
    placeOfSupplyStateCode: draft.customer.stateCode,
  });

  const isDraft = state === "DRAFT";
  return {
    number: isDraft ? "Draft" : number,
    isDraft,
    seller: company,
    customer: draft.customer,
    issueDateLabel: formatLongDate(draft.issueDate),
    dueDateLabel: draft.dueDate ? formatLongDate(draft.dueDate) : null,
    paymentTerms: draft.paymentTerms,
    currency: draft.currency,
    notes: draft.notes,
    calc,
    showHsnColumn: draft.lines.some((l) => Boolean(l.hsnSac?.trim())),
    showLut: calc.regime === "export",
  };
}
