import { requireUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/permissions";
import { CustomerList } from "@/features/customers/customer-list";
import { listCustomers } from "@/features/customers/queries";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const user = await requireUser("read");
  const { q, archived } = await searchParams;
  const customers = await listCustomers({
    search: q?.trim() || undefined,
    includeArchived: archived === "1",
  });

  return (
    <CustomerList
      customers={customers}
      search={q}
      includeArchived={archived === "1"}
      canEdit={can(user.role, "write")}
    />
  );
}
