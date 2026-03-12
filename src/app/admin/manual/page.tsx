import { AdminManualClient } from "@/components/admin/manual/manual-client";
import { requireOwner } from "@/lib/admin/server-auth";
import { getAdminManualIndex } from "@/lib/manual/content";

export const metadata = {
  title: "LessonFlow Reference Manual"
};

/**
 * Protected in-app manual landing page for admin operators.
 */
export default async function AdminManualPage() {
  await requireOwner();
  const manualIndex = await getAdminManualIndex();
  return <AdminManualClient content={manualIndex} />;
}
