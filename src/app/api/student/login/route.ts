import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auPostcodeSchema } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { log } from "@/lib/observability";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { normalizeFullNameForLookup, verifyPortalPassword } from "@/lib/student-portal/credentials";
import {
  createStudentSessionToken,
  getStudentSessionCookieName,
  getStudentSessionMaxAgeSeconds
} from "@/lib/student-portal/session";

const MAX_LOGIN_CANDIDATES = 20;

const loginSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  postcode: auPostcodeSchema,
  password: z.string().min(1).max(256)
});

/**
 * Authenticates students using normalized full name + postcode + portal password.
 * Duplicate name/postcode matches are handled by bounded hash verification attempts.
 */
export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit({
    key: `student-login:${getRequestIp(request)}`,
    limit: 20,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many login attempts. Please try again shortly."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
  }

  const normalizedFullName = normalizeFullNameForLookup(parsed.data.fullName);
  const postcode = parsed.data.postcode.trim();
  const candidates = await prisma.customer.findMany({
    where: {
      isArchived: false,
      normalizedFullName,
      postcode,
      portalCredential: {
        is: {
          isActive: true
        }
      }
    },
    include: {
      portalCredential: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_LOGIN_CANDIDATES + 1
  });

  if (candidates.length > MAX_LOGIN_CANDIDATES) {
    log("warn", "student_portal.login.candidate_limit_exceeded", {
      normalizedFullName,
      postcode,
      count: candidates.length
    });
  }

  const boundedCandidates = candidates.slice(0, MAX_LOGIN_CANDIDATES);
  let matchedCustomerId: string | null = null;

  for (const candidate of boundedCandidates) {
    const credential = candidate.portalCredential;
    if (!credential || !credential.isActive) {
      continue;
    }
    const validPassword = await verifyPortalPassword({
      plaintext: parsed.data.password,
      passwordHash: credential.passwordHash
    });
    if (validPassword) {
      matchedCustomerId = candidate.id;
      break;
    }
  }

  if (!matchedCustomerId) {
    return NextResponse.json({ error: "Invalid login details." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getStudentSessionCookieName(),
    value: createStudentSessionToken(matchedCustomerId),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: getStudentSessionMaxAgeSeconds()
  });
  return response;
}
