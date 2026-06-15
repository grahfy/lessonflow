/**
 * Client Error Reporting API
 *
 * Receives error reports from the client-side React error boundaries
 * (`app/error.tsx`, `admin/error.tsx`, `student/error.tsx`) and persists them to
 * the SystemLog table so browser crashes are visible in the admin console.
 *
 * SECURITY MODEL: This endpoint is intentionally UNAUTHENTICATED — an error
 * boundary can fire before/while auth state is established — so it is hardened
 * against abuse:
 *   1. Strict zod schema with tight length caps (bounded payload).
 *   2. Hard request-body size cap before parsing (cheap DoS guard).
 *   3. Per-IP rate limit (storm/flood guard).
 *   4. logError ONLY — it NEVER sends an owner alert email, so it cannot be used
 *      to spoof a server-side critical alert or flood the owner inbox.
 *   5. No input is reflected back in the response (no XSS / no oracle).
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeRateLimit, getRequestIpFromHeaders } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

/** Hard cap on the raw request body (bytes) before we even attempt to parse. */
const MAX_BODY_BYTES = 8 * 1024;

/**
 * Strict report schema. Every field is length-capped so a single report can
 * never bloat the SystemLog row, and unknown keys are stripped by zod.
 */
const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  stack: z.string().max(4000).optional(),
  digest: z.string().max(200).optional(),
  /** Which boundary reported the error (constrained to a known set). */
  boundary: z.enum(["root", "admin", "student"]),
  /** Page path where the error surfaced; capped and not reflected. */
  path: z.string().max(500).optional()
});

export async function POST(request: Request) {
  // Guard 1: per-IP rate limit. Generous enough for legitimate boundary fires
  // (which retry on user action) but bounds a flood from any single source.
  const ip = getRequestIpFromHeaders(request.headers);
  const gate = consumeRateLimit({
    key: `client-error:${ip}`,
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false },
      {
        status: 429,
        headers: gate.retryAfterSeconds
          ? { "Retry-After": String(gate.retryAfterSeconds) }
          : undefined
      }
    );
  }

  // Guard 2: reject oversized payloads cheaply via the declared Content-Length.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  // Guard 3: read the raw body and enforce the byte cap defensively (a missing
  // or lying Content-Length must not let an oversized body through).
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Guard 4: strict validation. We do NOT echo zod's error details back to the
  // client (no input reflection); a generic 400 is sufficient.
  const parsed = clientErrorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Persist as a normal error. logCritical is deliberately NOT used here:
  // client-reported errors must never trigger an owner alert email.
  logError("client_error", parsed.data.stack ?? parsed.data.message, {
    boundary: parsed.data.boundary,
    message: parsed.data.message,
    digest: parsed.data.digest,
    path: parsed.data.path
  });

  return NextResponse.json({ ok: true });
}
