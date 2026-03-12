import { redirect } from "next/navigation";

import { getCurrentAdmin, isOwnerAdmin } from "@/lib/admin-auth";
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

/**
 * Server-side auth check for owner-only admin routes.
 */
export async function requireOwner(): Promise<boolean> {
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

    if (!isOwnerAdmin(admin)) {
        redirect("/admin/bookings");
        return false;
    }

    return true;
}
