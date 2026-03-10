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
import { getAdminFromToken, getSessionCookieName } from "@/lib/admin-auth";

/**
 * Validates the administrative session of an incoming Request.
 * 
 * @param request - Next.js Request object with cookies
 * @returns The matching DB Admin record or null if the session is invalid/missing.
 */
export async function requireAdminFromRequest(request: NextRequest) {
  const token = request.cookies.get(getSessionCookieName())?.value;
  return getAdminFromToken(token);
}
