import React, { type ReactElement } from "react";

import { AdminAboutPageContent } from "@/components/admin/about/about-page-content";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { getAdminBuildInfo } from "@/lib/build-info";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "About LessonFlow"
};

/**
 * Protected admin page for static product, release, and credit information.
 */
export default async function AdminAboutPage(): Promise<ReactElement> {
  await requireOwner();

  return (
    <AdminShell title="About LessonFlow" className="admin-shell-about">
      <AdminAboutPageContent buildInfo={await getAdminBuildInfo()} />
    </AdminShell>
  );
}
