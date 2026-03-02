import { AdminInvoicesClient } from "@/components/admin-invoices-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Invoices"
};

/**
 * Protected admin invoices route.
 */
export default async function AdminInvoicesPage() {
  await requireAdmin();
  return <AdminInvoicesClient />;
}
