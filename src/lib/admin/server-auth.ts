import { redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

/**
 * Server-side auth check for admin routes.
 * Redirects to /setup if not configured, or /admin/login if not authenticated.
 */
export async function requireAdmin(): Promise<boolean> {
    const setupComplete = await isSetupComplete();
    if (!setupComplete) {
        redirect("/setup");
        return false;
    }

    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect("/admin/login");
        return false;
    }

    return true;
}
