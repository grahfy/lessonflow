import { AdminCustomersClient } from "@/components/admin/customers/customers-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Customers"
};

/**
 * Protected admin customers directory route.
 */
export default async function AdminCustomersPage() {
  await requireAdmin();
  return <AdminCustomersClient />;
}
