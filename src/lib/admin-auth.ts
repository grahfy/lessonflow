/**
 * Admin Authentication & Session Service
 * 
 * Provides session-based authentication for LessonFlow administrators using 
 * cryptographically signed tokens (HMAC) stored in secure cookies.
 * 
 * SECURITY ARCHITECTURE:
 * 1. HMAC-SHA256: Tokens are signed with a server-side secret to prevent tampering.
 * 2. Stateless Sessions: Contains email, issued-at time, and expiration (base64url encoded).
 * 3. BCrypt: Passwords hashed with high cost factor (12).
 * 4. Secure Cookies: HttpOnly and Secure flags mitigate session hijacking.
 * 
 * RATIONALE: We use a stateless signed-token approach to avoid DB lookups 
 * on every protected layout/page load, ensuring the Admin UI stays snappy 
 * even under load.
 */

import { AdminRole, AdminUser } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { AppError } from "./errors";

const COOKIE_NAME = "admin_session";

/**
 * Resolves the cryptographic secret from environment.
 * RATIONALE: This is the root of trust. Changing this invalidates ALL sessions.
 */
function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new AppError("ADMIN_SESSION_SECRET is required. Set it in your environment variables.", "MISSING_CONFIG", 500);
  }
  return secret;
}

/** Signs the encoded payload to ensure it hasn't been modified by the client. */
function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/** Standard base64url encoding for token segments. */
function encode(data: object): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

/**
 * Validates a "payload.signature" token.
 * 
 * LOGIC:
 * 1. Verifies the signature matches the payload via HMAC.
 * 2. Checks the `exp` timestamp against current server time.
 */
function decode(token: string): { email: string; exp: number; iat: number | null } | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    
    if (signPayload(payload) !== signature) return null;

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      exp?: unknown;
      iat?: unknown;
    };

    if (typeof parsed.email !== "string" || typeof parsed.exp !== "number") return null;
    const issuedAt = typeof parsed.iat === "number" ? parsed.iat : null;
    if (!parsed.exp || Date.now() > parsed.exp) return null;

    return { email: parsed.email, exp: parsed.exp, iat: issuedAt };
  } catch {
    return null;
  }
}

/**
 * Issues a new signed session token.
 * Expire duration is hardcoded to 7 days for a balance of UX and security.
 */
export function createSessionToken(email: string): string {
  const issuedAt = Date.now();
  const payload = encode({
    email,
    iat: issuedAt,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 days
  });
  return `${payload}.${signPayload(payload)}`;
}

/** Revealed for middleware/header consistency. */
export function getSessionCookieName() {
  return COOKIE_NAME;
}

/**
 * Ensures a baseline 'Owner' account exists in the database.
 * RATIONALE: Automates initial setup using the .env provided credentials.
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
    if (existing.role !== "owner" || !existing.isActive) {
      return prisma.adminUser.update({
        where: { id: existing.id },
        data: {
          role: "owner",
          isActive: true
        }
      });
    }
    return existing;
  }

  return prisma.adminUser.create({
    data: {
      email,
      role: "owner",
      firstName: "Owner",
      displayName,
      passwordHash,
      isActive: true
    }
  });
}

/** Retrieves the primary admin (usually the school owner/founder). */
export async function getPrimaryActiveAdmin(): Promise<AdminUser | null> {
  return prisma.adminUser.findFirst({
    where: {
      isActive: true,
      role: "owner"
    },
    orderBy: { createdAt: "asc" }
  });
}

export function isOwnerRole(role: AdminRole): boolean {
  return role === "owner";
}

export function isTeacherRole(role: AdminRole): boolean {
  return role === "teacher";
}

export function isOwnerAdmin(admin: Pick<AdminUser, "role">): boolean {
  return isOwnerRole(admin.role);
}

export function isTeacherAdmin(admin: Pick<AdminUser, "role">): boolean {
  return isTeacherRole(admin.role);
}

/** Checks provided credentials against stored BCrypt hashes. */
export async function verifyAdminPassword(email: string, password: string): Promise<AdminUser | null> {
  const user = await prisma.adminUser.findUnique({
    where: { email }
  });
  if (!user || !user.isActive) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

/** Resolves the full database user from a raw header token. */
export async function getAdminFromToken(token?: string | null): Promise<AdminUser | null> {
  if (!token) return null;
  const data = decode(token);
  if (!data) return null;

  const admin = await prisma.adminUser.findFirst({
    where: {
      email: data.email,
      isActive: true
    }
  });
  if (!admin) return null;

  if (admin.sessionInvalidBefore) {
    const invalidBeforeMs = admin.sessionInvalidBefore.getTime();
    if (data.iat === null || data.iat < invalidBeforeMs) {
      return null;
    }
  }

  return admin;
}

/**
 * Helper for Server Components to get the current context user.
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return getAdminFromToken(token);
}
