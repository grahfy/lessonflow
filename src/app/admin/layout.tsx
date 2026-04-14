import type { PropsWithChildren } from "react";

import { noIndexMetadata } from "@/lib/seo";
import { AutoLogout } from "@/components/admin/auto-logout";
import { AdminInitialRoleProvider } from "@/lib/admin/admin-initial-role-context";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const metadata = noIndexMetadata;

/**
 * Keeps all admin routes out of search indexes while leaving route rendering
 * unchanged.  Provides the server-known admin role to client components so
 * role-gated nav items render immediately without a client-side API round-trip.
 */
export default async function AdminLayout({ children }: PropsWithChildren) {
  const admin = await getCurrentAdmin();

  return (
    <AdminInitialRoleProvider role={admin?.role ?? null}>
      <AutoLogout />
      {children}
    </AdminInitialRoleProvider>
  );
}
