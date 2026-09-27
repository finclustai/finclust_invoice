import "server-only";
import { fromMinor } from "@/domain/money/bigint";
import type { CurrencyCode } from "@/domain/money/currency";
import { db } from "@/infra/db";

export interface CatalogItem {
  id: string;
  description: string;
  hsnSac: string | null;
  rateMinor: number;
  currency: CurrencyCode;
}

export async function listCatalog(includeArchived = false): Promise<CatalogItem[]> {
  const rows = await db.catalogItem.findMany({
    where: includeArchived ? {} : { isArchived: false },
    orderBy: { description: "asc" },
    select: { id: true, description: true, hsnSac: true, rateMinor: true, currency: true },
  });
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    hsnSac: r.hsnSac,
    rateMinor: fromMinor(r.rateMinor),
    currency: r.currency as CurrencyCode,
  }));
}
