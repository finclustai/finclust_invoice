import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";
import { SidebarNav } from "./sidebar-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_1fr] lg:items-start">
      <SidebarNav user={user} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
