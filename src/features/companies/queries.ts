import "server-only";
import { db } from "@/infra/db";

const SELECT = {
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
  isArchived: true,
} as const;

export async function listCompanies(includeArchived = false) {
  return db.company.findMany({
    where: includeArchived ? {} : { isArchived: false },
    orderBy: [{ isArchived: "asc" }, { createdAt: "asc" }],
    select: { ...SELECT, _count: { select: { invoices: true } } },
  });
}

export async function getCompany(id: string) {
  return db.company.findUnique({ where: { id }, select: SELECT });
}

/**
 * The companies an invoice can be billed from, with everything the PDF prints.
 * Switching seller has to change the bank block as well as the tax, so the
 * picker carries the full details rather than just a name.
 */
export async function listSellerOptions() {
  return db.company.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "asc" },
    select: {
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
    },
  });
}

export type SellerOption = Awaited<ReturnType<typeof listSellerOptions>>[number];
