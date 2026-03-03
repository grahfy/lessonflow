import { AdminManualClient } from "@/components/admin/manual/manual-client";
import { requireAdmin } from "@/lib/admin/server-auth";
import { getAdminManualIndex } from "@/lib/manual/content";

export const metadata = {
  title: "Booking Console Manual"
};

/**
 * Protected in-app manual landing page for admin operators.
 */
export default async function AdminManualPage() {
  await requireAdmin();
  const manualIndex = await getAdminManualIndex();
  return <AdminManualClient content={manualIndex} />;
}
