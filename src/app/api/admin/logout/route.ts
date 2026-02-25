import { NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";

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
