import { requireUser } from "@/features/auth/current-user";
import { Dashboard } from "@/features/dashboard/dashboard";
import { loadDashboard } from "@/features/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser("read");
  const { today, currencies } = await loadDashboard();
  return <Dashboard currencies={currencies} today={today} />;
}
