import { redirect } from "next/navigation";

import { AdminBookingsClient } from "@/components/admin-bookings-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

export default async function AdminBookingsPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminBookingsClient />;
}
