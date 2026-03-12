import { AdminReportsClient } from "@/components/admin-reports-client";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Reports"
};

/**
 * Protected admin reports dashboard route.
 */
export default async function AdminReportsPage() {
  await requireOwner();
  return <AdminReportsClient />;
}
