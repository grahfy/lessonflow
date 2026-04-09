import { redirect } from "next/navigation";

import { getCurrentAdmin, isOwnerAdmin } from "@/lib/admin-auth";
import { getSetupCompletionState } from "@/lib/setup";

/**
 * Server-side auth check for admin routes.
 * Redirects to /setup if not configured, or /admin/login if not authenticated.
 */
export async function requireAdmin(): Promise<boolean> {
    const setupState = await getSetupCompletionState();
    if (setupState.status === "incomplete") {
        redirect("/setup");
        return false;
    }
    if (setupState.status === "unavailable") {
        redirect("/admin/login");
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
    const setupState = await getSetupCompletionState();
    if (setupState.status === "incomplete") {
        redirect("/setup");
        return false;
    }
    if (setupState.status === "unavailable") {
        redirect("/admin/login");
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
