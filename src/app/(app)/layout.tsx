import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-line bg-paper px-6 py-3">
        <span className="font-extrabold tracking-tight">
          FINCLUST <span className="font-semibold text-mid">Invoices</span>
        </span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-body">{user.name}</span>
          <span className="rounded-full bg-sand px-2 py-0.5 font-mono text-xs text-mid">{user.role}</span>
          <form action="/logout" method="post">
            <button className="btn">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
