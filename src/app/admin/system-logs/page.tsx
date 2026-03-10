import { SystemLogsClient } from "@/components/admin/system-logs-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "System Logs"
};

/**
 * Protected admin system logs route.
 */
export default async function SystemLogsPage() {
  await requireAdmin();
  return <SystemLogsClient />;
}
