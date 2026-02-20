import { redirect } from "next/navigation";

import { AdminInvoicesClient } from "@/components/admin-invoices-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

/**
 * Protected admin invoices route.
 */
export default async function AdminInvoicesPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminInvoicesClient />;
}
