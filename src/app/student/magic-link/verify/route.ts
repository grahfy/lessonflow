import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { log } from "@/lib/observability";
import { consumeMagicLinkNonce } from "@/lib/student-portal/magic-link";
import {
  createStudentSessionToken,
  getStudentSessionCookieName,
  getStudentSessionMaxAgeSeconds,
  verifyStudentMagicLinkToken
} from "@/lib/student-portal/session";

/** Builds an absolute redirect back to the login page carrying a failure reason. */
function loginRedirect(request: NextRequest, reason: string): NextResponse {
  const url = new URL("/student/login", request.url);
  url.searchParams.set("magicLink", reason);
  return NextResponse.redirect(url);
}

/**
 * Redeems a magic-link token and establishes a student session.
 *
 * SECURITY:
 * - Rejects tampered/expired/wrong-purpose tokens (signature + `exp` + `purpose`).
 * - Rejects links whose `ver` no longer matches the customer's
 *   `sessionInvalidBefore` (invalidated by a later logout / credential rotation).
 * - Enforces single-use via the in-memory consumed-nonce set: a redeemed link
 *   cannot be replayed.
 * - On success, mints the SAME 30-day `student_session` cookie as password login
 *   (identical httpOnly/secure/sameSite/path/maxAge). No CAPTCHA on this path.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return loginRedirect(request, "invalid");
  }

  const payload = verifyStudentMagicLinkToken(token);
  if (!payload) {
    return loginRedirect(request, "invalid");
  }

  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    include: { portalCredential: true }
  });

  // Generic "invalid" for any account-state failure so verify leaks nothing about
  // whether the customer id exists or is portal-enabled.
  if (!customer || customer.isArchived || !customer.portalCredential?.isActive) {
    return loginRedirect(request, "invalid");
  }

  // Version binding: a logout or credential rotation after the link was issued
  // advances `sessionInvalidBefore`, so a stale link is refused.
  const currentVersion = customer.sessionInvalidBefore?.getTime() ?? 0;
  if (payload.ver !== currentVersion) {
    return loginRedirect(request, "expired");
  }

  // Single-use: reject a nonce that was already redeemed (replay).
  if (!consumeMagicLinkNonce(payload.nonce, payload.exp)) {
    return loginRedirect(request, "used");
  }

  log("info", "student_portal.magic_link.consumed", { customerId: customer.id });

  const response = NextResponse.redirect(new URL("/student/portal", request.url));
  response.cookies.set({
    name: getStudentSessionCookieName(),
    value: createStudentSessionToken(customer.id),
    httpOnly: true,
    // Keep local development usable over HTTP while requiring secure cookies in production.
    secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1",
    sameSite: "lax",
    path: "/",
    maxAge: getStudentSessionMaxAgeSeconds()
  });
  return response;
}
