import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, getSessionCookieName, verifyAdminPassword } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { isSetupComplete } from "@/lib/setup";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = consumeRateLimit({
      key: `admin-login:${getRequestIp(request)}`,
      limit: 12,
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

    const setupComplete = await isSetupComplete();
    if (!setupComplete) {
      return NextResponse.json(
        {
          error: "Setup is not complete. Open /setup to initialize the application.",
          code: "SETUP_REQUIRED"
        },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    const admin = await verifyAdminPassword(email, password);
    if (!admin) {
      return NextResponse.json({ error: "Invalid login credentials." }, { status: 401 });
    }

    const token = createSessionToken(admin.email);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
    return response;
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to complete admin login.");
  }
}
