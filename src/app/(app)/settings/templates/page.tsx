import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/features/auth/current-user";
import { TemplateEditor } from "@/features/settings/template-editor";
import { loadTemplates } from "@/features/settings/templates";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireUser("admin");
  const templates = await loadTemplates();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/settings" className="btn field-sm mb-4">
        <ArrowLeft size={15} aria-hidden />
        Settings
      </Link>
      <h1 className="text-2xl">Email templates</h1>
      <p className="mt-0.5 mb-5 text-sm text-mid">
        What the Send box starts with. You can still change the wording before each draft is created.
      </p>
      <TemplateEditor templates={templates} />
    </main>
  );
}
