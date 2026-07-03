import { AdminShell } from "@/components/admin/layout/admin-shell";
import { requireOwner } from "@/lib/admin/server-auth";
import { UpdateProgressClient } from "./update-progress-client";

export default async function UpdateProgressPage() {
  await requireOwner();

  return (
    <AdminShell title="System Update in Progress">
      <UpdateProgressClient />
    </AdminShell>
  );
}
