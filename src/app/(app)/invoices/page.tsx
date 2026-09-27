import Link from "next/link";
import { Plus } from "lucide-react";
import { formatMoney } from "@/domain/money/currency";
import { requireUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/permissions";
import { createDraftInvoice } from "@/features/invoices/actions";
import { listInvoices, listPeriods } from "@/features/invoices/queries";
import { periodLabel, STATUS_STYLE } from "@/features/invoices/status-style";

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
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Invoices</h1>
          <p className="mt-0.5 text-sm text-mid">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            {period ? ` in ${periodLabel(period)}` : ""}
          </p>
        </div>
        {can(user.role, "write") && (
          <form action={createDraftInvoice}>
            <button className="btn btn-primary" type="submit">
              <Plus size={16} strokeWidth={2.5} aria-hidden />
              New invoice
            </button>
          </form>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/invoices" className={`chip ${period ? "bg-sand text-body" : "bg-orange-tint text-ink"}`}>
          All
        </Link>
        {periods.map((p) => (
          <Link
            key={p}
            href={`/invoices?period=${p}`}
            className={`chip ${period === p ? "bg-orange-tint text-ink" : "bg-sand text-body"}`}
          >
            {periodLabel(p)}
          </Link>
        ))}
        <form className="ml-auto" action="/invoices">
          {period && <input type="hidden" name="period" value={period} />}
          <input
            className="field field-sm w-56"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search number or customer"
            aria-label="Search invoices"
          />
        </form>
      </div>

      {invoices.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="font-extrabold">No invoices here</h2>
          <p className="mt-1 text-sm text-body">
            {q || period ? "Try a different month, or clear the search." : "Create your first invoice to get started."}
          </p>
        </div>
      ) : (
        <>
          {/* Cards on a phone, a table above md: a table that scrolls sideways
              on a phone is worse than either. */}
          <ul className="space-y-2.5 md:hidden">
            {invoices.map((inv) => {
              const status = STATUS_STYLE[inv.status];
              return (
                <li key={inv.id}>
                  <Link href={`/invoices/${inv.id}`} className="card block p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold">{inv.status === "draft" ? "Draft" : inv.number}</span>
                      <span className={`chip ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-body">{inv.customerName}</p>
                    <p className="tnum mt-2 text-lg font-extrabold">
                      {formatMoney(inv.totalMinor, inv.currency)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Number", "Date", "Customer", "Status", "Total"].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-bold tracking-wider text-mid uppercase ${h === "Total" ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const status = STATUS_STYLE[inv.status];
                  return (
                    <tr key={inv.id} className="border-b border-line last:border-0 hover:bg-sand">
                      <td className="px-4 py-2.5">
                        <Link href={`/invoices/${inv.id}`} className="font-mono font-bold underline-offset-2 hover:underline">
                          {inv.status === "draft" ? "Draft" : inv.number}
                        </Link>
                      </td>
                      <td className="tnum px-4 py-2.5 text-mid">{inv.issueDate}</td>
                      <td className="max-w-[16rem] truncate px-4 py-2.5">{inv.customerName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`chip ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold">
                        {formatMoney(inv.totalMinor, inv.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
