import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, getSessionCookieName, verifyAdminPassword } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { verifyCaptchaGuard } from "@/lib/captcha";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { getSetupCompletionState } from "@/lib/setup";

/**
 * Admin login endpoint.
 *
 * This route owns rate limiting, setup gating, credential verification, and session cookie issuance
 * so the client login form can remain a thin UI wrapper.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate-limit by proxy-aware request IP to slow brute-force attempts.
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

    const setupState = await getSetupCompletionState();
    if (setupState.status === "unavailable") {
      return NextResponse.json(
        {
          error: setupState.message,
          code: setupState.errorCode
        },
        { status: 503 }
      );
    }

    if (setupState.status === "incomplete") {
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
    
    // Debug logging for development
    if (process.env.NODE_ENV === "development") {
      console.log("[LOGIN] Attempt:", { email, passwordLength: password.length });
    }
    
    const gate = verifyCaptchaGuard({
      body,
      headers: request.headers,
      scope: "admin-login",
      limit: 18,
      windowMs: 10 * 60 * 1000
    });
    if (!gate.ok) {
      if (process.env.NODE_ENV === "development") {
        console.log("[LOGIN] CAPTCHA guard failed:", gate.code, gate.message);
      }
      return NextResponse.json(
        { error: gate.message, code: gate.code },
        {
          status: gate.status,
          headers: gate.retryAfterSeconds ? { "Retry-After": String(gate.retryAfterSeconds) } : undefined
        }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[LOGIN] CAPTCHA passed, verifying password...");
    }
    
    const admin = await verifyAdminPassword(email, password);
    if (!admin) {
      if (process.env.NODE_ENV === "development") {
        console.log("[LOGIN] Password verification failed for:", email);
      }
      return NextResponse.json({ error: "Invalid login credentials." }, { status: 401 });
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[LOGIN] Success for:", email);
    }

    const token = createSessionToken(admin.email);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      // Allow local HTTP development while enforcing secure cookies in production.
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
