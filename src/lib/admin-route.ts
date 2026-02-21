import { NextRequest } from "next/server";

import { getAdminFromToken, getSessionCookieName } from "@/lib/admin-auth";

/**
 * Middleware function to authenticate admin users from incoming requests.
 * 
 * SECURITY: This function extracts the session token from cookies and validates
 * it against the admin authentication system. Used to protect admin-only routes.
 * 
 * @returns The authenticated admin user object if valid token exists, null otherwise
 */
export async function requireAdminFromRequest(request: NextRequest) {
  // Extract session token from the admin session cookie
  const token = request.cookies.get(getSessionCookieName())?.value;
  // Validate token and return admin user or null
  return getAdminFromToken(token);
}
