import "server-only";
import { db } from "@/infra/db";
import { deriveStatus, type InvoiceStatus } from "@/domain/invoice/status";
import { businessDay } from "@/domain/invoice/today";
import { fromMinor } from "@/domain/money/bigint";
import type { CurrencyCode } from "@/domain/money/currency";
import type { CompanyForPdf } from "@/pdf/props";
import { rowToDraft, type InvoiceRow } from "./mapping";

const INVOICE_SELECT = {
  id: true,
  number: true,
  state: true,
  version: true,
  companyId: true,
  customerId: true,
  customerSnapshot: true,
  issueDate: true,
  dueDate: true,
  paymentTerms: true,
  currency: true,
  template: true,
  gstEnabled: true,
  taxRateBp: true,
  notes: true,
  lines: {
    select: {
      id: true,
      position: true,
      description: true,
      hsnSac: true,
      qtyMilli: true,
      rateMinor: true,
      amountMinor: true,
    },
    orderBy: { position: "asc" },
  },
} as const;

const COMPANY_SELECT = {
  id: true,
  name: true,
  addressLines: true,
  email: true,
  phone: true,
  gstin: true,
  stateCode: true,
  lut: true,
  bankName: true,
  bankAccount: true,
  bankIfsc: true,
  bankBranch: true,
  defaultTemplate: true,
} as const;

/** Everything the editor and the PDF route need, in one round trip. */
export async function loadInvoice(id: string) {
  const row = await db.invoice.findUnique({ where: { id }, select: INVOICE_SELECT });
  if (!row) return null;
  const company = await db.company.findUnique({
    where: { id: row.companyId },
    select: COMPANY_SELECT,
  });
  if (!company) return null;
  const { id: _companyId, defaultTemplate: _t, ...pdfCompany } = company;
  return {
    id: row.id,
    company: pdfCompany satisfies CompanyForPdf,
    ...rowToDraft(row as InvoiceRow),
  };
}

export interface InvoiceListRow {
  id: string;
  number: string;
  period: string;
  customerName: string;
  issueDate: string;
  currency: CurrencyCode;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  status: InvoiceStatus;
}

export async function listInvoices(opts: { period?: string; search?: string } = {}): Promise<InvoiceListRow[]> {
  const rows = await db.invoice.findMany({
    where: {
      ...(opts.period ? { period: opts.period } : {}),
      ...(opts.search
        ? {
            OR: [
              { number: { contains: opts.search, mode: "insensitive" as const } },
              { customer: { name: { contains: opts.search, mode: "insensitive" as const } } },
              // Also the name printed on the invoice: after a customer is
              // renamed, searching the name on the PDF the CA is holding has
              // to find it.
              { customerSnapshot: { path: ["name"], string_contains: opts.search } },
            ],
          }
        : {}),
    },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    select: {
      id: true,
      number: true,
      period: true,
      state: true,
      issueDate: true,
      dueDate: true,
      currency: true,
      totalMinor: true,
      paidMinor: true,
      customerSnapshot: true,
    },
  });

  const today = businessDay();
  return rows.map((r) => {
    const total = fromMinor(r.totalMinor);
    const paid = fromMinor(r.paidMinor);
    return {
      id: r.id,
      number: r.number,
      period: r.period,
      customerName: (r.customerSnapshot as { name?: string })?.name ?? "—",
      issueDate: r.issueDate.toISOString().slice(0, 10),
      currency: r.currency as CurrencyCode,
      totalMinor: total,
      paidMinor: paid,
      outstandingMinor: Math.max(0, total - paid),
      status: deriveStatus(
        {
          state: r.state,
          totalMinor: total,
          paidMinor: paid,
          dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
        },
        today,
      ),
    };
  });
}

/** The months that actually have invoices, newest first, for the list's tabs. */
export async function listPeriods(): Promise<string[]> {
  const rows = await db.invoice.findMany({
    distinct: ["period"],
    orderBy: { period: "desc" },
    select: { period: true },
  });
  return rows.map((r) => r.period);
}

export async function listCustomersForPicker() {
  return db.customer.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      addressLines: true,
      gstin: true,
      stateCode: true,
      emails: true,
      currency: true,
    },
  });
}

export async function getDefaultCompany() {
  return db.company.findFirst({ where: { isArchived: false }, select: COMPANY_SELECT });
}
