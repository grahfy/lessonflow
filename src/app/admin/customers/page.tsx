import { redirect } from "next/navigation";

import { AdminCustomersClient } from "@/components/admin-customers-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

/**
 * Protected admin customers directory route.
 */
export default async function AdminCustomersPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminCustomersClient />;
}
