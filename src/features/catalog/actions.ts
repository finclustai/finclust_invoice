"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toMinor } from "@/domain/money/bigint";
import { CURRENCY_CODES, parseMoney } from "@/domain/money/currency";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";

export interface CatalogFormState {
  error?: string;
  saved?: boolean;
}

const item = z.object({
  description: z.string().trim().min(1, "Describe the service").max(500),
  hsnSac: z.string().trim().max(10).nullable(),
  currency: z.enum(CURRENCY_CODES),
});

/** Unbound with the id in a hidden field, like the other forms. */
export async function saveCatalogItem(
  _prev: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  const user = await requireUser("write");
  const id = String(form.get("id") ?? "").trim() || null;
  const text = (k: string) => String(form.get(k) ?? "").trim();

  const parsed = item.safeParse({
    description: text("description"),
    hsnSac: text("hsnSac") || null,
    currency: text("currency") || "INR",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };

  // Accepts what people type: "1,50,000", "1500." — the same parser the
  // invoice grid uses, so a rate means the same thing in both places.
  const rateMinor = parseMoney(text("rate"));
  if (rateMinor === null) return { error: `“${text("rate")}” isn’t an amount` };

  const data = { ...parsed.data, rateMinor: toMinor(rateMinor) };
  const saved = id
    ? await db.catalogItem.update({ where: { id }, data, select: { id: true } })
    : await db.catalogItem.create({ data, select: { id: true } });

  await db.activityLog.create({
    data: { actorId: user.id, entity: "catalog", entityId: saved.id, action: id ? "edited" : "created" },
  });
  revalidatePath("/catalog");
  return { saved: true };
}

export async function archiveCatalogItem(id: string): Promise<void> {
  const user = await requireUser("write");
  await db.catalogItem.update({ where: { id }, data: { isArchived: true } });
  await db.activityLog.create({
    data: { actorId: user.id, entity: "catalog", entityId: id, action: "archived" },
  });
  revalidatePath("/catalog");
}
