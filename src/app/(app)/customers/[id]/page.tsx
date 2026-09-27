import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@/domain/money/currency";
import { requireUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/permissions";
import { CustomerForm } from "@/features/customers/customer-form";
import { ArchiveToggle } from "@/features/customers/archive-toggle";
import { getCustomer, listCustomerInvoices } from "@/features/customers/queries";
import { STATUS_STYLE } from "@/features/invoices/status-style";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("read");
  const { id } = await params;
  const [customer, invoices] = await Promise.all([getCustomer(id), listCustomerInvoices(id)]);
  if (!customer) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/customers" className="btn field-sm mb-4">
        <ArrowLeft size={15} aria-hidden />
        Customers
      </Link>
      <h1 className="mb-5 text-2xl">{customer.name}</h1>

      {can(user.role, "write") ? (
        <CustomerForm customer={customer} />
      ) : (
        <p className="card p-4 text-sm text-mid">You have read-only access.</p>
      )}

      <section className="mt-8">
        <h2 className="label">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="card p-6 text-center text-sm text-mid">Nothing billed to this customer yet.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => {
              const status = STATUS_STYLE[inv.status];
              return (
                <li key={inv.id}>
                  <Link href={`/invoices/${inv.id}`} className="card flex items-center gap-3 p-3 hover:bg-sand">
                    <span className="font-mono text-sm font-semibold">
                      {inv.status === "draft" ? "Draft" : inv.number}
                    </span>
                    <span className="text-xs text-mid">{inv.issueDate}</span>
                    <span className={`chip ${status.className}`}>{status.label}</span>
                    <span className="tnum ml-auto font-semibold">
                      {formatMoney(inv.totalMinor, inv.currency)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {can(user.role, "write") && (
        <ArchiveToggle id={customer.id} archived={customer.isArchived} invoiceCount={invoices.length} />
      )}
    </main>
  );
}
