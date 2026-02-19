import { redirect } from "next/navigation";

import { AdminBookingsClient } from "@/components/admin-bookings-client";
import { getCurrentAdmin } from "@/lib/admin-auth";

export default async function AdminBookingsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminBookingsClient />;
}
