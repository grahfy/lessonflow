import { redirect } from "next/navigation";

import { AdminInvoicesClient } from "@/components/admin-invoices-client";
import { getCurrentAdmin } from "@/lib/admin-auth";

/**
 * Protected admin invoices route.
 */
export default async function AdminInvoicesPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminInvoicesClient />;
}
