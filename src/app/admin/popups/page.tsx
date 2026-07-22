import React from "react";

import { PopupsClient } from "@/components/admin/popups/popups-client";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Site Popups"
};

export default async function AdminPopupsPage() {
  await requireOwner();
  return <PopupsClient />;
}
