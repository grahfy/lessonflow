import { NextRequest } from "next/server";

import { getAdminFromToken, getSessionCookieName } from "@/lib/admin-auth";

export async function requireAdminFromRequest(request: NextRequest) {
  const token = request.cookies.get(getSessionCookieName())?.value;
  return getAdminFromToken(token);
}
