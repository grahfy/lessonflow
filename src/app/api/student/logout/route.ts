import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getStudentSessionCookieName, requireStudentFromRequest } from "@/lib/student-portal/session";

/**
 * Clears the student session cookie.
 *
 * Also bumps the customer's `sessionInvalidBefore` so any other live stateless
 * tokens for this student (shared machine, leaked cookie) are revoked.
 */
export async function POST(request: NextRequest) {
  const student = await requireStudentFromRequest(request);
  if (student) {
    await prisma.customer.update({
      where: { id: student.id },
      data: { sessionInvalidBefore: new Date() }
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getStudentSessionCookieName(),
    value: "",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1",
    sameSite: "lax",
    maxAge: 0
  });
  return response;
}
