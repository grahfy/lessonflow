import { AdminBookingsClient } from "@/components/admin-bookings-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export default async function AdminBookingsPage() {
  await requireAdmin();
  return <AdminBookingsClient />;
}
