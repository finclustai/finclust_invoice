import { requireUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/permissions";
import { CatalogPage } from "@/features/catalog/catalog-page";
import { listCatalog } from "@/features/catalog/queries";

export const dynamic = "force-dynamic";

export default async function Catalog() {
  const user = await requireUser("read");
  const items = await listCatalog();
  return <CatalogPage items={items} canEdit={can(user.role, "write")} />;
}
