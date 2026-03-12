import { AdminTeachersClient } from "@/components/admin/teachers/teachers-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Teachers"
};

export default async function AdminTeachersPage() {
  await requireAdmin();
  return <AdminTeachersClient />;
}
