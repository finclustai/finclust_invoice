import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/features/auth/current-user";
import { CompanyForm } from "@/features/companies/company-form";

export default async function NewCompanyPage() {
  await requireUser("admin");
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/settings/companies" className="btn field-sm mb-4">
        <ArrowLeft size={15} aria-hidden />
        Companies
      </Link>
      <h1 className="mb-5 text-2xl">Add company</h1>
      <CompanyForm />
    </main>
  );
}
