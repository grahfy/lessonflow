import { VouchersClient } from "@/components/admin/vouchers/vouchers-client";
import { getDefaultCurrency } from "@/lib/branding";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Vouchers",
};

export default async function AdminVouchersPage() {
  await requireOwner();
  return <VouchersClient defaultCurrency={getDefaultCurrency()} />;
}
