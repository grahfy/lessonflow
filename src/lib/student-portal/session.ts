import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";

const STUDENT_SESSION_COOKIE_NAME = "student_session";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type StudentSessionPayload = {
  customerId: string;
  exp: number;
};

/**
 * Returns configured student-session max age in seconds with safe bounds.
 */
export function getStudentSessionMaxAgeSeconds(): number {
  const raw = Number.parseInt(process.env.STUDENT_SESSION_MAX_AGE_SECONDS || `${DEFAULT_MAX_AGE_SECONDS}`, 10);
  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_AGE_SECONDS;
  }
  return Math.min(Math.max(raw, 60), 60 * 60 * 24 * 365);
}

import { AppError } from "../errors";

/**
 * Resolves the secret used for signing student session tokens.
 * Throws in production if not configured.
 */
function getStudentSessionSecret(): string {
  const secret = process.env.STUDENT_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new AppError("STUDENT_SESSION_SECRET or ADMIN_SESSION_SECRET is required. Set it in your environment variables.", "MISSING_CONFIG", 500);
  }
  return secret;
}

/**
 * Signs the encoded payload with an HMAC to protect integrity.
 */
function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getStudentSessionSecret()).update(payload).digest("hex");
}

/**
 * Encodes session payload objects as compact base64url strings.
 */
function encode(data: StudentSessionPayload): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

/**
 * Decodes and verifies a signed student session token.
 */
function decode(token: string): StudentSessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  if (signPayload(payload) !== signature) {
    return null;
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StudentSessionPayload;
  if (!decoded.customerId || !decoded.exp || Date.now() > decoded.exp) {
    return null;
  }
  return decoded;
}

/**
 * Creates a signed student session token for a customer identity.
 */
export function createStudentSessionToken(customerId: string): string {
  const exp = Date.now() + getStudentSessionMaxAgeSeconds() * 1000;
  const payload = encode({
    customerId,
    exp
  });
  return `${payload}.${signPayload(payload)}`;
}

/**
 * Returns the cookie name used by student sessions.
 */
export function getStudentSessionCookieName(): string {
  return STUDENT_SESSION_COOKIE_NAME;
}

/**
 * Loads an active student identity from a token, excluding archived customers.
 */
export async function getStudentFromToken(token?: string | null) {
  if (!token) {
    return null;
  }
  const payload = decode(token);
  if (!payload) {
    return null;
  }
  const customer = await prisma.customer.findUnique({
    where: {
      id: payload.customerId
    }
  });
  if (!customer || customer.isArchived) {
    return null;
  }
  return customer;
}

/**
 * Reads current student identity from request cookies in server components.
 */
export async function getCurrentStudent() {
  const store = await cookies();
  return getStudentFromToken(store.get(STUDENT_SESSION_COOKIE_NAME)?.value);
}

/**
 * Reads and validates student identity directly from a Next.js request object.
 */
export async function requireStudentFromRequest(request: NextRequest) {
  const token = request.cookies.get(STUDENT_SESSION_COOKIE_NAME)?.value;
  return getStudentFromToken(token);
}

