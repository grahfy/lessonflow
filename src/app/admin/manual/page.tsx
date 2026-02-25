import { redirect } from "next/navigation";

import { AdminManualClient } from "@/components/admin-manual-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

export const metadata = {
  title: "Booking Console Manual"
};

/**
 * Protected in-app manual landing page for admin operators.
 */
export default async function AdminManualPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminManualClient />;
}
