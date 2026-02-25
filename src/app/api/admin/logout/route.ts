import { NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";

/**
 * Clears the admin session cookie.
 *
 * Implemented as a POST so logout is an explicit state-changing action and can be triggered from
 * admin clients without relying on link navigation semantics.
 */
export async function POST() {
  try {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(getSessionCookieName(), "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });
    return response;
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to sign out.");
  }
}
