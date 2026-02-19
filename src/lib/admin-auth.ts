import { AdminUser } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

const COOKIE_NAME = "admin_session";

function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "dev-secret";
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function encode(data: object): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

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

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return getAdminFromToken(token);
}
