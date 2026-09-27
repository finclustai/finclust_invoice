import { z } from "zod";
import { CURRENCY_CODES } from "../money/currency";

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function stateCodeFromGstin(gstin: string): string {
  return gstin.slice(0, 2);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const threeDecimals = (n: number) => Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;

export const customerSnapshotSchema = z.object({
  name: z.string().max(200),
  addressLines: z.array(z.string().max(200)).max(6),
  gstin: z.string().regex(GSTIN_PATTERN, "Invalid GSTIN").nullable(),
  /** GST state code of place of supply; null = outside India. */
  stateCode: z
    .string()
    .regex(/^\d{2}$/)
    .nullable(),
  emails: z.array(z.string().email()).max(10),
});

/** Lenient on purpose: a half-typed row must still autosave. validateForIssue is the strict gate. */
export const invoiceLineSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(500),
  hsnSac: z.string().max(10).nullable(),
  qty: z.number().min(0).max(1_000_000).refine(threeDecimals, "At most 3 decimals"),
  rateMinor: z.number().int().min(0).max(1e13),
});

export const invoiceDraftSchema = z
  .object({
    companyId: z.string().uuid(),
    customerId: z.string().uuid().nullable(),
    customer: customerSnapshotSchema,
    issueDate: isoDate,
    dueDate: isoDate.nullable(),
    paymentTerms: z.string().max(200).nullable(),
    currency: z.enum(CURRENCY_CODES),
    gstEnabled: z.boolean(),
    taxRateBp: z.number().int().min(0).max(10_000),
    template: z.string().min(1),
    notes: z.string().max(2000).nullable(),
    lines: z.array(invoiceLineSchema).max(200),
  })
  .refine((d) => d.dueDate === null || d.dueDate >= d.issueDate, {
    message: "Due date can't be before the invoice date",
    path: ["dueDate"],
  });

export type CustomerSnapshot = z.infer<typeof customerSnapshotSchema>;
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;
/** What a version stores: the draft plus what's needed to read it without joins. */
export type InvoiceSnapshot = InvoiceDraft & { number: string; companyName: string };

export function validateForIssue(draft: InvoiceDraft): string[] {
  const problems: string[] = [];
  if (!draft.customer.name.trim()) problems.push("Choose a customer");
  if (draft.lines.length === 0) problems.push("Add at least one line item");
  draft.lines.forEach((line, i) => {
    if (!line.description.trim()) problems.push(`Line ${i + 1}: add a description`);
    if (line.qty <= 0) problems.push(`Line ${i + 1}: quantity must be more than 0`);
  });
  return problems;
}
