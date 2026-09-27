import Link from "next/link";
import { Plus } from "lucide-react";
import { stateName } from "@/domain/invoice/state-codes";

export interface CustomerListRow {
  id: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  currency: string;
  isArchived: boolean;
  invoiceCount: number;
}

export function CustomerList({
  customers,
  search,
  includeArchived,
  canEdit,
}: {
  customers: CustomerListRow[];
  search?: string;
  includeArchived: boolean;
  canEdit: boolean;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Customers</h1>
          <p className="mt-0.5 text-sm text-mid">
            Saved once, then picked on an invoice — their details fill themselves in.
          </p>
        </div>
        {canEdit && (
          <Link href="/customers/new" className="btn btn-primary">
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            Add customer
          </Link>
        )}
      </header>

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/customers">
        <input
          className="field field-sm flex-1 basis-56"
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search by name or GSTIN"
          aria-label="Search customers"
        />
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
          Show archived
        </label>
        <button className="btn field-sm">Search</button>
      </form>

      {customers.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="font-extrabold">No customers yet</h2>
          <p className="mt-1 text-sm text-body">
            {search ? "Nothing matches that search." : "Add one and it will be ready to pick on your next invoice."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`} className="card flex items-center gap-3 p-4 hover:bg-sand">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{c.name}</span>
                    {c.isArchived && <span className="chip status-cancelled">Archived</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-mid">
                    {[
                      c.gstin,
                      c.stateCode ? stateName(c.stateCode) : "Outside India (export)",
                      c.currency,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-mid">
                  {c.invoiceCount} {c.invoiceCount === 1 ? "invoice" : "invoices"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
