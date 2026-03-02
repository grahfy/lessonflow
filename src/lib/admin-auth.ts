/**
 * Admin Authentication Module
 * 
 * Session-based authentication for admin users using HMAC-signed tokens.
 * 
 * SECURITY:
 * - Uses HMAC-SHA256 for session token signing
 * - Tokens expire after 7 days
 * - Passwords hashed with bcrypt (cost factor 12)
 * - Session secret must be 32+ characters
 */

import { AdminUser } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

/**
 * Cookie name for admin session token.
 */
const COOKIE_NAME = "admin_session";

/**
 * Retrieves the session signing secret from environment.
 * @throws Error if not configured
 */
function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is required. Set it in your environment variables.");
  }
  return secret;
}

/**
 * Signs payload using HMAC-SHA256 with session secret.
 */
function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/**
 * Encodes data as base64url for transport.
 */
function encode(data: object): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

/**
 * Decodes and verifies session token signature and expiration.
 * @returns Payload if valid, null if invalid/expired
 */
function decode(token: string): { email: string; exp: number } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  if (signPayload(payload) !== signature) {
    return null;
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    email: string;
    exp: number;
  };
  if (!parsed.exp || Date.now() > parsed.exp) {
    return null;
  }
  return parsed;
}

/**
 * Creates a signed session token valid for 7 days.
 */
export function createSessionToken(email: string): string {
  const payload = encode({
    email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  });
  return `${payload}.${signPayload(payload)}`;
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

/**
 * Ensures an owner admin exists (for legacy ENV-based setup).
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD from environment.
 */
export async function ensureOwnerAdmin(): Promise<AdminUser> {
  const email = process.env.ADMIN_EMAIL || "owner@example.com";
  const displayName = "Owner";
  const password = process.env.ADMIN_PASSWORD || "change-me";
  const passwordHash = await bcrypt.hash(password, 10);

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
 * Returns the oldest active admin account as a stable system actor.
 */
export async function getPrimaryActiveAdmin(): Promise<AdminUser | null> {
  return prisma.adminUser.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" }
  });
}

/**
 * Verifies admin credentials against database.
 * @returns Admin user if valid, null otherwise
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
 * Retrieves admin from session token (does not verify active status).
 */
export async function getAdminFromToken(token?: string | null): Promise<AdminUser | null> {
  if (!token) {
    return null;
  }
  const data = decode(token);
  if (!data) {
    return null;
  }
  return prisma.adminUser.findUnique({
    where: { email: data.email }
  });
}

/**
 * Gets current admin from request cookies.
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return getAdminFromToken(token);
}
