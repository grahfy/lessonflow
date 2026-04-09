/**
 * Admin Route Protection Utility
 * 
 * Provides a standardized way for API Route Handlers to verify administrative 
 * privileges before processing a request.
 * 
 * DESIGN RATIONALE:
 * 1. Request Isolation: Instead of relying on global state, this function 
 *    explicitly takes the `NextRequest` object to resolve the session cookie.
 * 2. Standardized Gatekeeping: By using this single helper across all `/api/admin/*` 
 *    routes, we ensure a unified security posture that is easy to audit.
 */

import { NextRequest } from "next/server";

import { getAdminFromToken, getSessionCookieName, isOwnerAdmin } from "@/lib/admin-auth";
import { createDatabaseUnavailableError, isDatabaseUnavailableError } from "@/lib/database-errors";

/**
 * Validates the administrative session of an incoming Request.
 * 
 * @param request - Next.js Request object with cookies
 * @returns The matching DB Admin record or null if the session is invalid/missing.
 */
export async function requireAdminFromRequest(request: NextRequest) {
  const token = request.cookies.get(getSessionCookieName())?.value;
  try {
    return await getAdminFromToken(token);
  } catch (error) {
    // RATIONALE: Session lookup is still a DB-backed operation. When the
    // database is down, admin APIs should surface a recoverable maintenance
    // state instead of silently converting the outage into a generic 500/HTML
    // response.
    if (isDatabaseUnavailableError(error)) {
      throw createDatabaseUnavailableError();
    }
    throw error;
  }
}

/**
 * Restricts a route handler to the owner-level admin account.
 */
export async function requireOwnerFromRequest(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin || !isOwnerAdmin(admin)) {
    return null;
  }
  return admin;
}
