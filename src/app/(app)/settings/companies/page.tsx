import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { stateName } from "@/domain/invoice/state-codes";
import { requireUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/permissions";
import { listCompanies } from "@/features/companies/queries";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const user = await requireUser("read");
  const companies = await listCompanies(true);
  const isAdmin = can(user.role, "admin");

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/settings" className="btn field-sm mb-4">
        <ArrowLeft size={15} aria-hidden />
        Settings
      </Link>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Companies</h1>
          <p className="mt-0.5 text-sm text-mid">Who the invoice is from, and where payment goes.</p>
        </div>
        {isAdmin && (
          <Link href="/settings/companies/new" className="btn btn-primary">
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            Add company
          </Link>
        )}
      </header>

      <ul className="space-y-2">
        {companies.map((c) => (
          <li key={c.id}>
            <Link href={isAdmin ? `/settings/companies/${c.id}` : "#"} className="card block p-4 hover:bg-sand">
              <span className="flex items-center gap-2">
                <span className="font-semibold">{c.name}</span>
                {c.isArchived && <span className="chip status-cancelled">Archived</span>}
              </span>
              <span className="mt-0.5 block text-xs text-mid">
                {[c.gstin, stateName(c.stateCode), c.bankName].filter(Boolean).join(" · ")}
              </span>
              <span className="mt-1 block text-xs text-mid">
                {c._count.invoices} {c._count.invoices === 1 ? "invoice" : "invoices"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {!isAdmin && <p className="hint mt-4">Only an admin can change these.</p>}
    </main>
  );
}
