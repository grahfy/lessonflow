/**
 * Cron Job Authentication
 *
 * Centralizes the `x-cron-secret` verification used by every `/api/jobs/*`
 * endpoint. Comparison is constant-time to avoid leaking the secret through a
 * length/prefix timing oracle on these public, data-mutating endpoints.
 */

import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getCronSecret } from "@/lib/env";

/**
 * Constant-time comparison of the request's `x-cron-secret` header against the
 * configured cron secret.
 *
 * RATIONALE: `crypto.timingSafeEqual` requires equal-length buffers, so we
 * length-guard first. A missing configured secret or missing/empty header
 * always returns false (fail closed).
 */
export function verifyCronSecret(request: Request): boolean {
  const configured = getCronSecret();
  if (!configured) {
    return false;
  }

  const provided = request.headers.get("x-cron-secret");
  if (!provided) {
    return false;
  }

  const configuredBuffer = Buffer.from(configured);
  const providedBuffer = Buffer.from(provided);
  if (configuredBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(configuredBuffer, providedBuffer);
}

/**
 * Returns a 401 `NextResponse` when the cron secret is missing or invalid,
 * or `null` when the request is authorized. Preserves the existing response
 * shape used across the job routes.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
