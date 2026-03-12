import { AdminInvoicesClient } from "@/components/admin/invoices/invoices-client";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Invoices"
};

/**
 * Protected admin invoices route.
 */
export default async function AdminInvoicesPage() {
  await requireOwner();
  return <AdminInvoicesClient />;
}
