"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GSTIN_PATTERN, stateCodeFromGstin } from "@/domain/invoice/schema";
import { isValidStateCode } from "@/domain/invoice/state-codes";
import { CURRENCY_CODES } from "@/domain/money/currency";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";

const customerInput = z
  .object({
    name: z.string().trim().min(1, "Give the customer a name").max(200),
    // One textarea, one line per address line: nobody wants five inputs.
    address: z.string().max(1000),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(GSTIN_PATTERN, "That doesn't look like a GSTIN")
      .nullable(),
    stateCode: z.string().refine(isValidStateCode, "Choose a place of supply").nullable(),
    emails: z.string().max(500),
    phone: z.string().trim().max(30).nullable(),
    currency: z.enum(CURRENCY_CODES),
    notes: z.string().trim().max(2000).nullable(),
  })
  // The GSTIN carries its own state; if the two disagree the invoice prints
  // one place of supply and is taxed under another.
  .refine((c) => c.gstin === null || stateCodeFromGstin(c.gstin) === c.stateCode, {
    message: "The place of supply must match the first two digits of the GSTIN",
    path: ["stateCode"],
  });

export interface CustomerFormState {
  errors?: Record<string, string>;
  savedId?: string;
}

function parse(form: FormData) {
  const text = (k: string) => String(form.get(k) ?? "").trim();
  return customerInput.safeParse({
    name: text("name"),
    address: text("address"),
    gstin: text("gstin") || null,
    stateCode: text("stateCode") || null,
    emails: text("emails"),
    phone: text("phone") || null,
    currency: text("currency") || "INR",
    notes: text("notes") || null,
  });
}

const toRow = (v: z.infer<typeof customerInput>) => ({
  name: v.name,
  addressLines: v.address
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6),
  gstin: v.gstin,
  stateCode: v.stateCode,
  emails: v.emails
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"))
    .slice(0, 10),
  phone: v.phone,
  currency: v.currency,
  notes: v.notes,
});

function errorsOf(issues: z.ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return errors;
}

/**
 * Takes the id from a hidden field rather than through `.bind()`. A bound
 * server action encrypts its arguments, and replaying that form without
 * JavaScript was measured at five minutes against two seconds for an unbound
 * one — the same shape the login form uses. Authorisation is unchanged: every
 * writer may edit every customer, and `requireUser` is what enforces it.
 */
export async function saveCustomer(
  _prev: CustomerFormState,
  form: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser("write");
  const id = String(form.get("id") ?? "").trim() || null;
  const parsed = parse(form);
  if (!parsed.success) return { errors: errorsOf(parsed.error.issues) };

  const data = toRow(parsed.data);
  const saved = id
    ? await db.customer.update({ where: { id }, data, select: { id: true } })
    : await db.customer.create({ data, select: { id: true } });

  await db.activityLog.create({
    data: {
      actorId: user.id,
      entity: "customer",
      entityId: saved.id,
      action: id ? "edited" : "created",
      meta: { name: data.name },
    },
  });

  revalidatePath("/customers");
  return { savedId: saved.id };
}

/**
 * Archived, never deleted: invoices carry a copy of the customer's details,
 * but the row is still what links an invoice to "everything for this client".
 */
export async function setCustomerArchived(id: string, archived: boolean): Promise<void> {
  const user = await requireUser("write");
  await db.customer.update({ where: { id }, data: { isArchived: archived } });
  await db.activityLog.create({
    data: { actorId: user.id, entity: "customer", entityId: id, action: archived ? "archived" : "restored" },
  });
  revalidatePath("/customers");
}
