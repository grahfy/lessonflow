import { redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

export default async function AdminIndexPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  redirect(admin ? "/admin/bookings" : "/admin/login");
}
