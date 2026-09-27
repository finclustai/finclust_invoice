import "server-only";
import { deriveStatus, type InvoiceStatus } from "@/domain/invoice/status";
import { businessDay } from "@/domain/invoice/today";
import { fromMinor } from "@/domain/money/bigint";
import type { CurrencyCode } from "@/domain/money/currency";
import { db } from "@/infra/db";

const SELECT = {
  id: true,
  name: true,
  addressLines: true,
  gstin: true,
  stateCode: true,
  emails: true,
  phone: true,
  currency: true,
  notes: true,
  isArchived: true,
} as const;

export type CustomerRow = {
  id: string;
  name: string;
  addressLines: string[];
  gstin: string | null;
  stateCode: string | null;
  emails: string[];
  phone: string | null;
  currency: string;
  notes: string | null;
  isArchived: boolean;
};

export async function listCustomers(opts: { search?: string; includeArchived?: boolean } = {}) {
  const rows = await db.customer.findMany({
    where: {
      ...(opts.includeArchived ? {} : { isArchived: false }),
      ...(opts.search
        ? {
            OR: [
              { name: { contains: opts.search, mode: "insensitive" as const } },
              { gstin: { contains: opts.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ isArchived: "asc" }, { name: "asc" }],
    select: { ...SELECT, _count: { select: { invoices: true } } },
  });
  return rows.map((r) => ({ ...r, invoiceCount: r._count.invoices }));
}

export async function getCustomer(id: string): Promise<CustomerRow | null> {
  return db.customer.findUnique({ where: { id }, select: SELECT });
}

/** Their invoices, so "what do they owe" is answerable from their own page. */
export async function listCustomerInvoices(customerId: string) {
  const rows = await db.invoice.findMany({
    where: { customerId },
    orderBy: [{ issueDate: "desc" }],
    select: {
      id: true,
      number: true,
      state: true,
      issueDate: true,
      dueDate: true,
      currency: true,
      totalMinor: true,
      paidMinor: true,
    },
  });
  const today = businessDay();
  return rows.map((r) => {
    const total = fromMinor(r.totalMinor);
    const paid = fromMinor(r.paidMinor);
    return {
      id: r.id,
      number: r.number,
      issueDate: r.issueDate.toISOString().slice(0, 10),
      currency: r.currency as CurrencyCode,
      totalMinor: total,
      status: deriveStatus(
        {
          state: r.state,
          totalMinor: total,
          paidMinor: paid,
          dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
        },
        today,
      ) as InvoiceStatus,
    };
  });
}
