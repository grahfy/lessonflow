import { redirect } from "next/navigation";

import { AdminReportsClient } from "@/components/admin-reports-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

export const metadata = {
  title: "Booking Console Reports"
};

/**
 * Protected admin reports dashboard route.
 */
export default async function AdminReportsPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminReportsClient />;
}
