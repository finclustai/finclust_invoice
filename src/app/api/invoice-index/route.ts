import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";

/** Ids and numbers, so scripts/check-pdf.mjs can walk every invoice. */
export async function GET() {
  await requireUser("read");
  const invoices = await db.invoice.findMany({
    orderBy: { number: "asc" },
    select: { id: true, number: true },
  });
  return Response.json(invoices);
}
