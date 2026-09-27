import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { requireUser } from "@/features/auth/current-user";

export default async function SettingsPage() {
  await requireUser("read");
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-5 text-2xl">Settings</h1>
      <ul className="space-y-2">
        <li>
          <Link href="/settings/companies" className="card flex items-center gap-3 p-4 hover:bg-sand">
            <Building2 size={18} className="text-mid" aria-hidden />
            <span className="flex-1">
              <span className="block font-semibold">Companies</span>
              <span className="block text-xs text-mid">Who the invoice is from, GSTIN, LUT and bank details</span>
            </span>
            <ChevronRight size={16} className="text-mid" aria-hidden />
          </Link>
        </li>
      </ul>
      <p className="hint mt-4">Users, the invoice template and where invoices are sent arrive in a later phase.</p>
    </main>
  );
}
