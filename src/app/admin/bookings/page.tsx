import { AdminBookingsClient } from "@/components/admin-bookings-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Bookings"
};

export default async function AdminBookingsPage() {
  await requireAdmin();
  return <AdminBookingsClient />;
}
