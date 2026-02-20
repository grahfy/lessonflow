import { redirect } from "next/navigation";

import { isSetupComplete } from "@/lib/setup";

export default async function AdminIndexPage() {
  const setupComplete = await isSetupComplete();
  redirect(setupComplete ? "/admin/bookings" : "/setup");
}
