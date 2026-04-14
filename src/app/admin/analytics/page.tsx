import { AdminAnalyticsClient } from "@/components/admin-analytics-client";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Site Analytics"
};

export default async function AdminAnalyticsPage() {
  await requireOwner();
  return <AdminAnalyticsClient />;
}
