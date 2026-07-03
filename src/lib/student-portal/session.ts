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
  /** Issued-at UNIX EPOCH timestamp in milliseconds (absent on legacy tokens). */
  iat?: number;
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
 *
 * SECURITY: Production requires a dedicated `STUDENT_SESSION_SECRET` so a leak of
 * the admin secret cannot forge student sessions (and vice versa). Outside
 * production (tests/dev) we still allow falling back to `ADMIN_SESSION_SECRET`
 * for convenience.
 */
function getStudentSessionSecret(): string {
  if (process.env.NODE_ENV === "production") {
    const dedicated = process.env.STUDENT_SESSION_SECRET;
    if (!dedicated) {
      throw new AppError(
        "Critical Security Error: STUDENT_SESSION_SECRET is required in production.",
        "MISSING_CONFIG",
        500
      );
    }
    return dedicated;
  }

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

/**
 * Constant-time comparison of a computed signature against the supplied one.
 * RATIONALE: Avoids leaking signature bytes via early-exit string comparison.
 */
function signatureMatches(payload: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(payload), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
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

  if (!signatureMatches(payload, signature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StudentSessionPayload & {
      purpose?: unknown;
    };
    // Domain separation: a session token carries NO `purpose`. A magic-link token
    // is signed with the SAME secret but carries `purpose: "magic-link"`, so
    // reject any token that has a `purpose` field to stop it being accepted here.
    if (decoded.purpose !== undefined) return null;
    // RATIONALE: We verify expiration BEFORE checking customer existence for speed.
    if (!decoded.customerId || !decoded.exp || Date.now() > decoded.exp) return null;
    // Legacy tokens lack `iat`; treat them as iat=0 so they remain revocable once
    // `sessionInvalidBefore` is set on the customer.
    const iat = typeof decoded.iat === "number" ? decoded.iat : 0;
    return { customerId: decoded.customerId, exp: decoded.exp, iat };
  } catch {
    return null;
  }
}

/**
 * Generates a fresh signed session token.
 */
export function createStudentSessionToken(customerId: string): string {
  const iat = Date.now();
  const exp = iat + getStudentSessionMaxAgeSeconds() * 1000;
  const payload = encode({ customerId, exp, iat });
  return `${payload}.${signPayload(payload)}`;
}

export function getStudentSessionCookieName(): string {
  return STUDENT_SESSION_COOKIE_NAME;
}

/**
 * Magic-Link Tokens (passwordless student login)
 *
 * A magic-link token is a SEPARATE, short-lived credential from the 30-day
 * session token above. It is HMAC-signed with the SAME `STUDENT_SESSION_SECRET`
 * (via `signPayload`) so no parallel secret exists, but a `purpose: "magic-link"`
 * field provides domain separation: `decode()` above rejects any token bearing
 * a `purpose`, so a magic-link token can never be accepted as a session token,
 * and `verifyStudentMagicLinkToken` requires `purpose === "magic-link"`, so a
 * session token can never be accepted as a magic link. Single-use consumption
 * and the `ver` (session-invalidation) binding are enforced by the verify route.
 */

/** Short default lifetime for one-tap login links. */
const MAGIC_LINK_DEFAULT_TTL_SECONDS = 15 * 60;

/** Inner structure of a signed magic-link token. */
export type StudentMagicLinkPayload = {
  /** The customer the link authenticates. */
  customerId: string;
  /** Domain separation: rejects cross-use with session tokens. */
  purpose: "magic-link";
  /** Expiration (UNIX EPOCH milliseconds). */
  exp: number;
  /** Issued-at (UNIX EPOCH milliseconds). */
  iat: number;
  /**
   * `customer.sessionInvalidBefore` epoch ms (0 when unset) captured at issue
   * time. If the customer logs out or rotates credentials after the link is
   * issued, the stored value advances and the link is rejected on verify.
   */
  ver: number;
  /** Random per-token value; single-use consumption keys on this. */
  nonce: string;
};

/** Bounds the magic-link lifetime from environment configuration (1 min .. 1 hour). */
export function getStudentMagicLinkTtlSeconds(): number {
  const raw = Number.parseInt(
    process.env.STUDENT_MAGIC_LINK_TTL_SECONDS || `${MAGIC_LINK_DEFAULT_TTL_SECONDS}`,
    10
  );
  if (!Number.isFinite(raw)) return MAGIC_LINK_DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(raw, 60), 60 * 60);
}

/**
 * Mints a signed, short-lived, purpose-scoped magic-link token.
 *
 * @param customerId - The customer the link authenticates.
 * @param sessionVersion - `customer.sessionInvalidBefore` epoch ms (0 when
 *   unset) at issue time; binds the link to the customer's revocation state.
 */
export function createStudentMagicLinkToken(customerId: string, sessionVersion: number): string {
  const iat = Date.now();
  const exp = iat + getStudentMagicLinkTtlSeconds() * 1000;
  const nonce = crypto.randomBytes(16).toString("hex");
  const data: StudentMagicLinkPayload = {
    customerId,
    purpose: "magic-link",
    exp,
    iat,
    ver: sessionVersion,
    nonce
  };
  const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

/**
 * Verifies signature + expiry + purpose of a magic-link token.
 * Returns the decoded payload, or null for tampered/expired/mismatched tokens.
 * Version binding and single-use consumption are enforced by the caller.
 */
export function verifyStudentMagicLinkToken(token: string): StudentMagicLinkPayload | null {
  const parts = token.split(".");
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  if (!signatureMatches(payload, signature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StudentMagicLinkPayload;
    if (decoded.purpose !== "magic-link") return null;
    if (!decoded.customerId || !decoded.exp || Date.now() > decoded.exp) return null;
    if (typeof decoded.ver !== "number" || typeof decoded.nonce !== "string" || !decoded.nonce) return null;
    return { customerId: decoded.customerId, purpose: "magic-link", exp: decoded.exp, iat: decoded.iat, ver: decoded.ver, nonce: decoded.nonce };
  } catch {
    return null;
  }
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

  // Stateless revocation: reject tokens issued before the customer's last
  // invalidation point (set on logout and credential rotation). Tokens without
  // an `iat` decode as iat=0, so they are revoked once the field is set.
  if (customer.sessionInvalidBefore) {
    const iat = payload.iat ?? 0;
    if (iat < customer.sessionInvalidBefore.getTime()) {
      return null;
    }
  }

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

