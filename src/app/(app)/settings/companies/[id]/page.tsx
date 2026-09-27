import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/features/auth/current-user";
import { CompanyForm } from "@/features/companies/company-form";
import { getCompany } from "@/features/companies/queries";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/settings/companies" className="btn field-sm mb-4">
        <ArrowLeft size={15} aria-hidden />
        Companies
      </Link>
      <h1 className="mb-5 text-2xl">{company.name}</h1>
      <CompanyForm company={company} />
    </main>
  );
}
