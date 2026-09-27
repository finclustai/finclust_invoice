import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/features/auth/current-user";
import { CustomerForm } from "@/features/customers/customer-form";

export default async function NewCustomerPage() {
  await requireUser("write");
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/customers" className="btn field-sm mb-4">
        <ArrowLeft size={15} aria-hidden />
        Customers
      </Link>
      <h1 className="mb-5 text-2xl">Add customer</h1>
      <CustomerForm />
    </main>
  );
}
