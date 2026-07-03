import { AdminLibraryClient } from "@/components/admin/library/library-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Library"
};

/**
 * Shared learning-materials Library. Visible to owner and teachers alike — the
 * library surface intentionally bypasses per-customer teacher scoping (any admin
 * manages any item and assigns to any student), so requireAdmin (not
 * requireOwner) gates the page.
 */
export default async function AdminLibraryPage() {
  await requireAdmin();
  return <AdminLibraryClient />;
}
