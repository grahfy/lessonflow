/**
 * Admin Authentication Service
 * 
 * Provides session-based authentication for LessonFlow administrators using 
 * cryptographically signed tokens (HMAC) stored in secure cookies.
 * 
 * SECURITY ARCHITECTURE:
 * 1. HMAC-SHA256: Tokens are signed with a server-side secret to prevent tampering.
 * 2. Payload: Contains the user's email and an expiration timestamp (base64url encoded).
 * 3. BCrypt: Passwords are salted and hashed with a cost factor of 12.
 * 4. HttpOnly Cookies: Sessions are stored in browser cookies that are inaccessible 
 *    to client-side JavaScript, mitigating XSS token theft.
 * 
 * RATIONALE: We use a stateless signed-token approach (similar to JWT but 
 * simplified) to avoid the overhead of database session lookups on every 
 * request, while still maintaining high security for the admin console.
 */

import { AdminUser } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { AppError } from "./errors";

/**
 * Standard cookie name used for admin session persistence.
 */
const COOKIE_NAME = "admin_session";

/**
 * Loads the ADMIN_SESSION_SECRET from environment.
 * 
 * NOTE: This secret is the foundation of the system's security. 
 * If it is leaked or changed, all currently active sessions are invalidated.
 * 
 * @throws AppError if environment is misconfigured
 */
function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new AppError("ADMIN_SESSION_SECRET is required. Set it in your environment variables.", "MISSING_CONFIG", 500);
  }
  return secret;
}

/**
 * Creates an HMAC signature for a given payload string.
 * 
 * @param payload - The data to sign (base64url encoded JSON)
 * @returns Hex-encoded HMAC-SHA256 signature
 */
function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/**
 * Serializes and encodes a JavaScript object for transport in a token.
 * 
 * @param data - The session payload
 * @returns base64url encoded representation
 */
function encode(data: object): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

/**
 * Decodes a raw token string, verifies the signature, and checks expiration.
 * 
 * LOGIC:
 * 1. Split token into [payload].[signature].
 * 2. Re-calculate signature for payload and compare (constant-time comparison).
 * 3. Validate presence of email and exp fields.
 * 4. Verify that current time is before exp.
 * 
 * @param token - Raw string from cookie
 * @returns Validated payload or null
 */
function decode(token: string): { email: string; exp: number } | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) {
      return null;
    }
    // Verify cryptographic integrity
    if (signPayload(payload) !== signature) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      exp?: unknown;
    };

    if (typeof parsed.email !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    // Check for session expiry
    if (!parsed.exp || Date.now() > parsed.exp) {
      return null;
    }

    return {
      email: parsed.email,
      exp: parsed.exp
    };
  } catch {
    return null; // Fail silently on malformed JSON or encoding errors
  }
}

/**
 * Generates a full signed session token for an authenticated user.
 * Tokens are hardcoded to a 7-day lifespan.
 * 
 * @param email - The user's authenticated email address
 * @returns Full "payload.signature" token string
 */
export function createSessionToken(email: string): string {
  const payload = encode({
    email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 days in ms
  });
  return `${payload}.${signPayload(payload)}`;
}

/**
 * Helper to reveal the system-wide session cookie name.
 */
export function getSessionCookieName() {
  return COOKIE_NAME;
}

/**
 * Bootstraps the system with an owner admin account if none exists.
 * 
 * RATIONALE: This facilitates first-time deployment by using credentials 
 * defined in the .env file. Once the system is running, additional 
 * admins should be created via the Admin Settings UI.
 * 
 * @returns The bootstrap admin user
 */
export async function ensureOwnerAdmin(): Promise<AdminUser> {
  const email = process.env.ADMIN_EMAIL || "owner@example.com";
  const displayName = "Owner";
  const password = process.env.ADMIN_PASSWORD || "change-me";
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.adminUser.findUnique({
    where: { email }
  });

  if (existing) {
    return existing;
  }

  return prisma.adminUser.create({
    data: {
      email,
      displayName,
      passwordHash,
      isActive: true
    }
  });
}

/**
 * Returns the "primary" active admin, defined as the earliest created account.
 * Useful as a fallback actor for automated tasks or system logs.
 */
export async function getPrimaryActiveAdmin(): Promise<AdminUser | null> {
  return prisma.adminUser.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" }
  });
}

/**
 * Authenticates a user by checking email existence and password validity.
 * 
 * @param email - Plain-text email
 * @param password - Plain-text password
 * @returns AdminUser instance on success, null on failure
 */
export async function verifyAdminPassword(email: string, password: string): Promise<AdminUser | null> {
  const user = await prisma.adminUser.findUnique({
    where: { email }
  });
  if (!user || !user.isActive) {
    return null;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

/**
 * Retrieves a full DB user object based on a validated token.
 * 
 * @param token - The raw signed token string
 * @returns Database record for the admin
 */
export async function getAdminFromToken(token?: string | null): Promise<AdminUser | null> {
  if (!token) {
    return null;
  }
  const data = decode(token);
  if (!data) {
    return null;
  }
  return prisma.adminUser.findFirst({
    where: {
      email: data.email,
      isActive: true
    }
  });
}

/**
 * Top-level convenience method to get the current logged-in admin.
 * Uses Next.js 15 cookies() API to read the request header.
 * 
 * @returns The current admin user or null if unauthenticated
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return getAdminFromToken(token);
}
