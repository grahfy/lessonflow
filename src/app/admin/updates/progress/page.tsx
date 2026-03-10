import { AdminShell } from "@/components/admin/layout/admin-shell";
import { UpdateProgressClient } from "./update-progress-client";

export default function UpdateProgressPage() {
  return (
    <AdminShell title="System Update in Progress">
      <UpdateProgressClient />
    </AdminShell>
  );
}
