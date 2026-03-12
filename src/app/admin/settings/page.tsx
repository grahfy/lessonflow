import { AdminSettingsClient } from "@/components/admin/settings/settings-client";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Settings"
};

/**
 * Protected admin settings route for managing environment-backed configuration.
 */
export default async function AdminSettingsPage() {
  await requireOwner();
  return <AdminSettingsClient />;
}
