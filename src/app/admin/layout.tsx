import type { PropsWithChildren } from "react";

import { noIndexMetadata } from "@/lib/seo";
import { AutoLogout } from "@/components/admin/auto-logout";

export const metadata = noIndexMetadata;

/**
 * Keeps all admin routes out of search indexes while leaving route rendering unchanged.
 */
export default function AdminLayout({ children }: PropsWithChildren) {
  return (
    <>
      <AutoLogout />
      {children}
    </>
  );
}
