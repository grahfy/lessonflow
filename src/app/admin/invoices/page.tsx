import { AdminInvoicesClient } from "@/components/admin/invoices/invoices-client";
import { getDefaultCurrency } from "@/lib/branding";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Invoices"
};

/**
 * Protected admin invoices route.
 */
export default async function AdminInvoicesPage() {
  await requireOwner();
  return <AdminInvoicesClient defaultCurrency={getDefaultCurrency()} />;
}
