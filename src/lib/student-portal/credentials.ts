import { CustomerPortalCredential, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { decryptPortalSecret, encryptPortalSecret } from "@/lib/student-portal/crypto";

type DbClient = Prisma.TransactionClient | typeof prisma;

const PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
const DEFAULT_PASSWORD_LENGTH = 14;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 64;

/**
 * Normalizes a customer full name for deterministic login lookup.
 * Rules intentionally stay conservative: trim, collapse whitespace, lowercase.
 */
export function normalizeFullNameForLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Builds optional tokenized name text for future admin search refinements.
 * This field is not used for authentication decisions.
 */
export function buildNameSearchTokens(value: string): string | null {
  const normalized = normalizeFullNameForLookup(value);
  if (!normalized) {
    return null;
  }
  const unique = [...new Set(normalized.split(" ").filter(Boolean))];
  return unique.length ? unique.join(" ") : null;
}

/**
 * Parses and bounds the generated password length from environment configuration.
 */
function getConfiguredPasswordLength(): number {
  const raw = Number.parseInt(process.env.STUDENT_PORTAL_PASSWORD_LENGTH || `${DEFAULT_PASSWORD_LENGTH}`, 10);
  if (!Number.isFinite(raw)) {
    return DEFAULT_PASSWORD_LENGTH;
  }
  return Math.min(Math.max(raw, MIN_PASSWORD_LENGTH), MAX_PASSWORD_LENGTH);
}

/**
 * Generates a readable, high-entropy password for student portal credentials.
 */
function generatePortalPassword(length: number): string {
  const chars = Array.from({ length }, () => {
    const index = crypto.randomInt(0, PASSWORD_CHARSET.length);
    return PASSWORD_CHARSET[index];
  });
  return chars.join("");
}

/**
 * Hashes a portal password for secure verification during login.
 */
async function hashPortalPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verifies a plaintext portal password against its stored hash.
 */
export async function verifyPortalPassword(input: {
  plaintext: string;
  passwordHash: string;
}): Promise<boolean> {
  return bcrypt.compare(input.plaintext, input.passwordHash);
}

/**
 * Writes a credential audit entry for generation/reveal/rotation events.
 */
async function writeCredentialAuditLog(input: {
  db: DbClient;
  customerId: string;
  credentialId?: string | null;
  actorId?: string | null;
  action: "generated" | "rotated" | "revealed";
  details?: string;
}): Promise<void> {
  await input.db.customerPortalCredentialAuditLog.create({
    data: {
      customerId: input.customerId,
      credentialId: input.credentialId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      details: input.details ?? null
    }
  });
}

/**
 * Returns an active db client, defaulting to the shared Prisma client.
 */
function resolveDbClient(tx?: DbClient): DbClient {
  return tx || prisma;
}

/**
 * Ensures a customer has one active portal credential.
 * On first creation, this returns the generated plaintext password for email UX.
 */
export async function ensurePortalCredentialForCustomer(input: {
  customerId: string;
  actorId?: string | null;
  tx?: DbClient;
  details?: string;
}): Promise<{
  credential: CustomerPortalCredential;
  generatedPassword: string | null;
  created: boolean;
}> {
  const db = resolveDbClient(input.tx);
  const existing = await db.customerPortalCredential.findUnique({
    where: { customerId: input.customerId }
  });
  if (existing) {
    return {
      credential: existing,
      generatedPassword: null,
      created: false
    };
  }

  const customer = await db.customer.findUnique({
    where: { id: input.customerId }
  });
  if (!customer || customer.isArchived) {
    throw new Error("Cannot provision portal credential for missing or archived customer.");
  }

  const generatedPassword = generatePortalPassword(getConfiguredPasswordLength());
  const passwordHash = await hashPortalPassword(generatedPassword);
  const passwordEncrypted = encryptPortalSecret(generatedPassword);

  const credential = await db.customerPortalCredential.create({
    data: {
      customerId: input.customerId,
      passwordHash,
      passwordEncrypted,
      isActive: true
    }
  });

  await writeCredentialAuditLog({
    db,
    customerId: input.customerId,
    credentialId: credential.id,
    actorId: input.actorId ?? null,
    action: "generated",
    details: input.details || "Portal credential generated."
  });

  return {
    credential,
    generatedPassword,
    created: true
  };
}

/**
 * Rotates a customer portal password and invalidates the previous secret.
 */
export async function rotatePortalCredential(input: {
  customerId: string;
  actorId?: string | null;
  tx?: DbClient;
  details?: string;
}): Promise<{
  credential: CustomerPortalCredential;
  generatedPassword: string;
  created: boolean;
}> {
  const db = resolveDbClient(input.tx);
  const existing = await db.customerPortalCredential.findUnique({
    where: { customerId: input.customerId }
  });

  if (!existing) {
    const created = await ensurePortalCredentialForCustomer({
      customerId: input.customerId,
      actorId: input.actorId,
      tx: db,
      details: input.details || "Portal credential generated via rotate action."
    });
    if (!created.generatedPassword) {
      throw new Error("Expected generated password when creating credential in rotate flow.");
    }
    return {
      credential: created.credential,
      generatedPassword: created.generatedPassword,
      created: true
    };
  }

  const generatedPassword = generatePortalPassword(getConfiguredPasswordLength());
  const passwordHash = await hashPortalPassword(generatedPassword);
  const passwordEncrypted = encryptPortalSecret(generatedPassword);
  const rotatedAt = new Date();

  const credential = await db.customerPortalCredential.update({
    where: { id: existing.id },
    data: {
      passwordHash,
      passwordEncrypted,
      isActive: true,
      rotatedAt
    }
  });

  await writeCredentialAuditLog({
    db,
    customerId: input.customerId,
    credentialId: credential.id,
    actorId: input.actorId ?? null,
    action: "rotated",
    details: input.details || "Portal credential rotated."
  });

  return {
    credential,
    generatedPassword,
    created: false
  };
}

/**
 * Reveals a customer's current portal password for authenticated admin workflows.
 */
export async function revealPortalPasswordForAdmin(input: {
  customerId: string;
  actorId?: string | null;
  tx?: DbClient;
  details?: string;
}): Promise<{
  password: string;
  credential: CustomerPortalCredential;
}> {
  const db = resolveDbClient(input.tx);
  const credential = await db.customerPortalCredential.findUnique({
    where: { customerId: input.customerId }
  });
  if (!credential) {
    throw new Error("Portal credential not found for customer.");
  }
  if (!credential.isActive) {
    throw new Error("Portal credential is inactive for customer.");
  }

  const password = decryptPortalSecret(credential.passwordEncrypted);
  await writeCredentialAuditLog({
    db,
    customerId: input.customerId,
    credentialId: credential.id,
    actorId: input.actorId ?? null,
    action: "revealed",
    details: input.details || "Portal credential revealed by admin."
  });

  return {
    password,
    credential
  };
}

