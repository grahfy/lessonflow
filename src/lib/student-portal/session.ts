/**
 * Student Session & Security Registry
 * 
 * Provides stateless, signed session tokens for student portal authentication.
 * 
 * CORE ARCHITECTURE:
 * 1. Statelessness: We use Signed Tokens (HMAC) instead of database-backed 
 *    sessions. This significantly reduces DB load and allows for immediate 
 *    authentication checks in Middlewares and Edge Functions.
 * 2. Cryptographic Integrity: Every token is signed with `STUDENT_SESSION_SECRET` 
 *    using SHA-256 HMAC. Any modification to the Customer ID or Expiration 
 *    timestamp will invalidate the signature.
 * 3. Atomic Revocation: Although the token is stateless, we re-verify the 
 *    `isArchived` status on every Server Component load to ensure that 
 *    administratively locked students cannot use their remaining session time.
 */

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { AppError } from "../errors";

/** Primary cookie identifier. */
const STUDENT_SESSION_COOKIE_NAME = "student_session";

/** Standard 30-day session durability. */
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Inner structure of the signed session token. */
type StudentSessionPayload = {
  /** The UUID of the authenticated customer. */
  customerId: string;
  /** UNIX EPOCH timestamp in milliseconds. */
  exp: number;
};

/**
 * Bounds the session duration from environment configuration.
 */
export function getStudentSessionMaxAgeSeconds(): number {
  const raw = Number.parseInt(process.env.STUDENT_SESSION_MAX_AGE_SECONDS || `${DEFAULT_MAX_AGE_SECONDS}`, 10);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_AGE_SECONDS;
  return Math.min(Math.max(raw, 60), 60 * 60 * 24 * 365);
}

/**
 * Resolves the signing secret, enforcing high-security in production.
 */
function getStudentSessionSecret(): string {
  const secret = process.env.STUDENT_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new AppError("Critical Security Error: STUDENT_SESSION_SECRET is not configured.", "MISSING_CONFIG", 500);
  }
  return secret;
}

/**
 * Computes an HMAC-SHA256 signature for the payload string.
 * RATIONALE: Protects against session hijacking where a user tries to 
 * impersonate another customer ID.
 */
function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getStudentSessionSecret()).update(payload).digest("hex");
}

/** Base64URL encoding for cookie safety. */
function encode(data: StudentSessionPayload): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

/**
 * Verifies and parses a signed session token.
 * logic:
 * 1. Split payload from signature.
 * 2. Verify signature matches payload + secret.
 * 3. Parse JSON and check expiration.
 */
function decode(token: string): StudentSessionPayload | null {
  const parts = token.split(".");
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  
  if (signPayload(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StudentSessionPayload;
    // RATIONALE: We verify expiration BEFORE checking customer existence for speed.
    if (!decoded.customerId || !decoded.exp || Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generates a fresh signed session token.
 */
export function createStudentSessionToken(customerId: string): string {
  const exp = Date.now() + getStudentSessionMaxAgeSeconds() * 1000;
  const payload = encode({ customerId, exp });
  return `${payload}.${signPayload(payload)}`;
}

export function getStudentSessionCookieName(): string {
  return STUDENT_SESSION_COOKIE_NAME;
}

/**
 * Hydrates a full Customer entity from a session token.
 * 
 * DESIGN RATIONALE: While the session is technically 'valid' if the 
 * signature is correct, we re-query the database to verify the 
 * `isArchived` flag. This allows admins to "kill" active sessions 
 * by archiving a customer record.
 */
export async function getStudentFromToken(token?: string | null) {
  if (!token) return null;
  
  const payload = decode(token);
  if (!payload) return null;

  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId }
  });

  if (!customer || customer.isArchived) return null;
  
  return customer;
}

/** Utility for Server Components. */
export async function getCurrentStudent() {
  const store = await cookies();
  const token = store.get(STUDENT_SESSION_COOKIE_NAME)?.value;
  return getStudentFromToken(token);
}

/** Utility for API Routes. */
export async function requireStudentFromRequest(request: NextRequest) {
  const token = request.cookies.get(STUDENT_SESSION_COOKIE_NAME)?.value;
  return getStudentFromToken(token);
}

