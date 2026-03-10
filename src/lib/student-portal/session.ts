/**
 * Student Session Management
 * 
 * Provides stateless, signed session tokens for student portal authentication.
 * 
 * DESIGN RATIONALE:
 * - Statelessness: Using signed tokens (HMAC) instead of database-backed sessions 
 *   reduces DB load and allows for highly efficient authentication in Middlewares 
 *   and Server Components.
 * - Integrity: Every token is signed with a secret (`STUDENT_SESSION_SECRET`) using 
 *   SHA-256 HMAC. Any modification to the payload will invalidate the signature.
 * - Expiration: Sessions include an `exp` timestamp in the payload, ensuring 
 *   tokens eventually expire even if they aren't explicitly revoked.
 * - Archival Guard: Authentication checks the `isArchived` flag in the DB, allowing 
 *   admins to instantly revoke a student's access by archiving their profile.
 * 
 * SECURITY NOTE: Ensure `STUDENT_SESSION_SECRET` is a long, random string in production.
 */

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { AppError } from "../errors";

/** Name of the HTTP-only cookie used to store the session. */
const STUDENT_SESSION_COOKIE_NAME = "student_session";
/** Default to 30 days if not configured via environment. */
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Inner structure of the signed session token. */
type StudentSessionPayload = {
  customerId: string;
  exp: number;
};

/**
 * Returns configured student-session max age in seconds with safe bounds.
 * Prevents extremely short or excessively long sessions.
 */
export function getStudentSessionMaxAgeSeconds(): number {
  const raw = Number.parseInt(process.env.STUDENT_SESSION_MAX_AGE_SECONDS || `${DEFAULT_MAX_AGE_SECONDS}`, 10);
  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_AGE_SECONDS;
  }
  return Math.min(Math.max(raw, 60), 60 * 60 * 24 * 365);
}

/**
 * Resolves the secret used for signing student session tokens.
 * Throws in production if not configured to prevent weak default security.
 */
function getStudentSessionSecret(): string {
  const secret = process.env.STUDENT_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new AppError("STUDENT_SESSION_SECRET or ADMIN_SESSION_SECRET is required. Set it in your environment variables.", "MISSING_CONFIG", 500);
  }
  return secret;
}

/**
 * Signs the encoded payload with an HMAC-SHA256 signature.
 * RATIONALE: This prevents "fiddling" with the payload (e.g. changing customerId).
 */
function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getStudentSessionSecret()).update(payload).digest("hex");
}

/**
 * Encodes session payload objects as compact base64url strings for cookie compatibility.
 */
function encode(data: StudentSessionPayload): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

/**
 * Decodes and verifies a signed student session token.
 * 
 * VALIDATION STEPS:
 * 1. Checks structure (payload.signature).
 * 2. Re-computes signature to verify integrity.
 * 3. Checks expiration timestamp.
 * 4. Verifies presence of customerId.
 */
function decode(token: string): StudentSessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  
  if (signPayload(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StudentSessionPayload;
    if (!decoded.customerId || !decoded.exp || Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generates a signed session token for the given customer ID.
 */
export function createStudentSessionToken(customerId: string): string {
  const exp = Date.now() + getStudentSessionMaxAgeSeconds() * 1000;
  const payload = encode({ customerId, exp });
  return `${payload}.${signPayload(payload)}`;
}

/** Exposes the constant for usage in Set-Cookie headers. */
export function getStudentSessionCookieName(): string {
  return STUDENT_SESSION_COOKIE_NAME;
}

/**
 * Resolves a full Customer profile from a session token.
 * RATIONALE: While the token is stateless, we re-query the DB here to 
 * verify that the customer hasn't been archived or deleted since login.
 */
export async function getStudentFromToken(token?: string | null) {
  if (!token) return null;
  
  const payload = decode(token);
  if (!payload) return null;

  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId }
  });

  // Revoke access immediately if archived.
  if (!customer || customer.isArchived) return null;
  
  return customer;
}

/**
 * Helper to fetch the current student identity in Server Components.
 */
export async function getCurrentStudent() {
  const store = await cookies();
  const token = (await store).get(STUDENT_SESSION_COOKIE_NAME)?.value;
  return getStudentFromToken(token);
}

/**
 * Helper to fetch student identity in API Route Handlers.
 */
export async function requireStudentFromRequest(request: NextRequest) {
  const token = request.cookies.get(STUDENT_SESSION_COOKIE_NAME)?.value;
  return getStudentFromToken(token);
}

