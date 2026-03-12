import { SystemLogsClient } from "@/components/admin/system-logs-client";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "System Logs"
};

/**
 * Protected admin system logs route.
 */
export default async function SystemLogsPage() {
  await requireOwner();
  return <SystemLogsClient />;
}
