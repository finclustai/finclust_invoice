"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GSTIN_PATTERN, stateCodeFromGstin } from "@/domain/invoice/schema";
import { isValidStateCode } from "@/domain/invoice/state-codes";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";

const companyInput = z
  .object({
    name: z.string().trim().min(1, "Give the company a name").max(200),
    address: z.string().max(1000),
    email: z.string().trim().email("That doesn't look like an email").nullable(),
    phone: z.string().trim().max(30).nullable(),
    gstin: z.string().trim().toUpperCase().regex(GSTIN_PATTERN, "That doesn't look like a GSTIN").nullable(),
    stateCode: z.string().refine(isValidStateCode, "Choose the state this company is registered in"),
    lut: z.string().trim().max(40).nullable(),
    bankName: z.string().trim().max(120).nullable(),
    bankAccount: z.string().trim().max(40).nullable(),
    bankIfsc: z.string().trim().toUpperCase().max(20).nullable(),
    bankBranch: z.string().trim().max(120).nullable(),
  })
  // The seller's state is one half of the same-state test that decides
  // CGST+SGST versus IGST, so it cannot contradict the GSTIN it is printed with.
  .refine((c) => c.gstin === null || stateCodeFromGstin(c.gstin) === c.stateCode, {
    message: "The state must match the first two digits of the GSTIN",
    path: ["stateCode"],
  });

export interface CompanyFormState {
  errors?: Record<string, string>;
  savedId?: string;
}

/** Unbound, with the id in a hidden field: a bound action's form takes minutes
 *  to submit without JavaScript. Same shape as the customer form. */
export async function saveCompany(
  _prev: CompanyFormState,
  form: FormData,
): Promise<CompanyFormState> {
  const user = await requireUser("admin");
  const id = String(form.get("id") ?? "").trim() || null;
  const text = (k: string) => String(form.get(k) ?? "").trim();

  const parsed = companyInput.safeParse({
    name: text("name"),
    address: text("address"),
    email: text("email") || null,
    phone: text("phone") || null,
    gstin: text("gstin") || null,
    stateCode: text("stateCode"),
    lut: text("lut") || null,
    bankName: text("bankName") || null,
    bankAccount: text("bankAccount") || null,
    bankIfsc: text("bankIfsc") || null,
    bankBranch: text("bankBranch") || null,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { errors };
  }

  const { address, ...rest } = parsed.data;
  const data = {
    ...rest,
    addressLines: address
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6),
  };

  const saved = id
    ? await db.company.update({ where: { id }, data, select: { id: true } })
    : await db.company.create({ data, select: { id: true } });

  await db.activityLog.create({
    data: {
      actorId: user.id,
      entity: "company",
      entityId: saved.id,
      action: id ? "edited" : "created",
      meta: { name: data.name },
    },
  });

  revalidatePath("/settings/companies");
  return { savedId: saved.id };
}

export async function setCompanyArchived(id: string, archived: boolean): Promise<void> {
  const user = await requireUser("admin");
  // The last active company cannot be archived: a new invoice needs a seller.
  if (archived) {
    const active = await db.company.count({ where: { isArchived: false } });
    if (active <= 1) throw new Error("You need at least one company to invoice from");
  }
  await db.company.update({ where: { id }, data: { isArchived: archived } });
  await db.activityLog.create({
    data: { actorId: user.id, entity: "company", entityId: id, action: archived ? "archived" : "restored" },
  });
  revalidatePath("/settings/companies");
}
