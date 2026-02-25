import { redirect } from "next/navigation";

import { AdminSettingsClient } from "@/components/admin-settings-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

export const metadata = {
  title: "Booking Console Settings"
};

/**
 * Protected admin settings route for managing environment-backed configuration.
 */
export default async function AdminSettingsPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminSettingsClient />;
}
