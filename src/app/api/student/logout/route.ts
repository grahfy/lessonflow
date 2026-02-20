import { NextResponse } from "next/server";

import { getStudentSessionCookieName } from "@/lib/student-portal/session";

/**
 * Clears the student session cookie.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getStudentSessionCookieName(),
    value: "",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0
  });
  return response;
}
