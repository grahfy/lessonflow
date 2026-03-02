import { AdminCustomersClient } from "@/components/admin-customers-client";
import { requireAdmin } from "@/lib/admin/server-auth";

/**
 * Protected admin customers directory route.
 */
export default async function AdminCustomersPage() {
  await requireAdmin();
  return <AdminCustomersClient />;
}
