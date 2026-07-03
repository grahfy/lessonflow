import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { normalizeEmail } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";
import { getPublicSiteUrl } from "@/lib/env";
import { log, logError } from "@/lib/observability";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import {
  buildStudentMagicLinkEmail,
  buildStudentMagicLinkVerifyUrl
} from "@/lib/student-portal/magic-link";
import {
  createStudentMagicLinkToken,
  getStudentMagicLinkTtlSeconds
} from "@/lib/student-portal/session";

// Generic, enumeration-safe response returned on EVERY request path regardless of
// whether the email matched a portal-enabled customer. This is the only success
// message a client ever sees, so it cannot be used to probe which emails exist.
const GENERIC_MESSAGE = "If an account matches that email, we've sent a login link. Please check your inbox.";

const requestSchema = z.object({
  email: z.string().trim().email().max(200),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(256).optional()
});

/**
 * Requests a passwordless magic-link login email.
 *
 * SECURITY:
 * - Always responds with a generic success message (no account enumeration).
 * - Rate-limited per IP and per normalized email to blunt abuse / inbox spam.
 * - Emails a signed, short-lived (15 min), single-use token bound to the matched
 *   customer; matching reuses the same portal-credential gate as password login.
 */
export async function POST(request: NextRequest) {
  // Throttle by proxy-aware IP before any DB work.
  const ipRateLimit = consumeRateLimit({
    key: `student-magic-link:${getRequestIp(request)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000
  });
  if (!ipRateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipRateLimit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  // Silently accept honeypot hits: return the generic message without sending so a
  // bot cannot distinguish this from a real request.
  if (parsed.data.website && parsed.data.website.trim()) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);

  // Per-email throttle (post-normalization) limits how often a single inbox can be
  // targeted; leaks nothing about existence because it applies before the lookup.
  const emailRateLimit = consumeRateLimit({
    key: `student-magic-link-email:${normalizedEmail}`,
    limit: 5,
    windowMs: 15 * 60 * 1000
  });
  if (!emailRateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(emailRateLimit.retryAfterSeconds) } }
    );
  }

  // Match an active, portal-enabled customer by normalized email. Mirrors the
  // password-login gate (not archived + active portal credential) so magic-link
  // access is available to exactly the same accounts.
  const customer = await prisma.customer.findFirst({
    where: {
      isArchived: false,
      normalizedEmail,
      portalCredential: { is: { isActive: true } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  if (customer && customer.email.trim()) {
    const sessionVersion = customer.sessionInvalidBefore?.getTime() ?? 0;
    const token = createStudentMagicLinkToken(customer.id, sessionVersion);
    const verifyUrl = buildStudentMagicLinkVerifyUrl(getPublicSiteUrl(), token);
    const ttlMinutes = Math.round(getStudentMagicLinkTtlSeconds() / 60);
    const email = buildStudentMagicLinkEmail({
      name: customer.fullName,
      verifyUrl,
      ttlMinutes
    });

    // ENUMERATION SAFETY: dispatch the send fire-and-forget rather than awaiting
    // it. Awaiting made the matched path measurably slower than the unmatched
    // path (which returns immediately), leaking which emails have accounts. Both
    // paths now return the same generic response in ~equivalent time. The .then/
    // .catch keep the promise handled so there is no unhandled rejection.
    void sendEmail({
      to: customer.email,
      subject: email.subject,
      html: email.html,
      // The link is a bearer login credential: never BCC it to the owner inbox.
      skipAuditBcc: true,
      notification: { triggerMode: "manual" }
    })
      .then((result) => {
        log("info", "student_portal.magic_link.requested", {
          customerId: customer.id,
          deliveryStatus: result.status
        });
      })
      .catch((error) => {
        // Never leak send failures to the client (would break enumeration safety);
        // record server-side for operator visibility.
        logError("student_portal.magic_link.send_failed", error, { customerId: customer.id });
      });
  }

  // Uniform response for matched, unmatched, and send-failure paths.
  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
