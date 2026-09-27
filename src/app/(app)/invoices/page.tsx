import { requireUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/permissions";
import { InvoiceList } from "@/features/invoices/list/invoice-list";
import { listInvoices, listPeriods } from "@/features/invoices/queries";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; q?: string }>;
}) {
  const user = await requireUser("read");
  const { period, q } = await searchParams;
  const [invoices, periods] = await Promise.all([
    listInvoices({ period, search: q?.trim() || undefined }),
    listPeriods(),
  ]);

  return (
    <InvoiceList
      invoices={invoices}
      periods={periods}
      period={period}
      query={q}
      canCreate={can(user.role, "write")}
    />
  );
}
