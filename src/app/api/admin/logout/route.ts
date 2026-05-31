import { NextRequest, NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

/**
 * Clears the admin session cookie.
 *
 * Implemented as a POST so logout is an explicit state-changing action and can be triggered from
 * admin clients without relying on link navigation semantics.
 *
 * Also bumps the admin's `sessionInvalidBefore` so any other live stateless
 * tokens for this account are revoked (`getAdminFromToken` enforces iat >= it).
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (admin) {
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { sessionInvalidBefore: new Date() }
      });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(getSessionCookieName(), "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1",
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });
    return response;
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to sign out.");
  }
}
