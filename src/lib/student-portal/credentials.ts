/**
 * Student Portal Credential Management Service
 * 
 * Orchestrates the lifecycle of student portal access, including generation, 
 * verification, rotation, and administrative auditing.
 * 
 * DESIGN RATIONALE:
 * 1. Hybrid Storage: We store both a one-way Hash (BCrypt for high-speed login 
 *    verification) and an Authenticated Encryption blob (AES-GCM for administrative 
 *    reveals/rotations). This provides security for the student while 
 *    allowing the teacher to help students who lose their passwords.
 * 2. Deterministic Lookups: Normalizes full names consistently to ensure 
 *    logins are whitespace and case-insensitive.
 * 3. High-Entropy Generation: Uses CSPRNG (crypto.randomInt) to generate 
 *    highly random passwords from a filtered character set (omitting ambiguous 
 *    glyphs like '1' and 'I').
 * 4. Immutable Audit Trail: Every lifecycle event (Create, Rotate, Reveal) is 
 *    logged with the performing actor ID to satisfy compliance requirements.
 */

import { CustomerPortalCredential, Prisma } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { decryptPortalSecret, encryptPortalSecret } from "@/lib/student-portal/crypto";

type DbClient = Prisma.TransactionClient | typeof prisma;

// Filtered charset avoids ambiguous glyphs and punctuation-entry mistakes when
// students copy or manually type portal credentials from email/admin surfaces.
const PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const DEFAULT_PASSWORD_LENGTH = 14;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 64;

/**
 * Ensures login lookups are stable.
 */
export function normalizeFullNameForLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Creates search-ready tokens for DB optimization.
 */
export function buildNameSearchTokens(value: string): string | null {
  const normalized = normalizeFullNameForLookup(value);
  if (!normalized) return null;
  const unique = [...new Set(normalized.split(" ").filter(Boolean))];
  return unique.length ? unique.join(" ") : null;
}

/**
 * Pulls security policy from environment.
 */
function getConfiguredPasswordLength(): number {
  const raw = Number.parseInt(process.env.STUDENT_PORTAL_PASSWORD_LENGTH || `${DEFAULT_PASSWORD_LENGTH}`, 10);
  if (!Number.isFinite(raw)) return DEFAULT_PASSWORD_LENGTH;
  return Math.min(Math.max(raw, MIN_PASSWORD_LENGTH), MAX_PASSWORD_LENGTH);
}

/**
 * Generates a CSPRNG based temporary password.
 */
function generatePortalPassword(length: number): string {
  const chars = Array.from({ length }, () => {
    const index = crypto.randomInt(0, PASSWORD_CHARSET.length);
    return PASSWORD_CHARSET[index];
  });
  return chars.join("");
}

/**
 * Standard BCrypt hashing for fast login verification.
 */
async function hashPortalPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verification gate for student logins.
 */
export async function verifyPortalPassword(input: {
  plaintext: string;
  passwordHash: string;
}): Promise<boolean> {
  return bcrypt.compare(input.plaintext, input.passwordHash);
}

/**
 * Records a security event in the audit log.
 * RATIONALE: Accountability is critical for revealable credentials.
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

function resolveDbClient(tx?: DbClient): DbClient {
  return tx || prisma;
}

/**
 * On-demand provisioning of portal access.
 * 
 * LOGIC:
 * 1. Returns existing if found.
 * 2. Generates new CSPRNG password.
 * 3. Hashes (fast lookup) AND Encrypts (revealable) the secret.
 * 4. Commits and Audits.
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

  return { credential, generatedPassword, created: true };
}

/**
 * Invalidates the current secret and creates a new one.
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

  return { credential, generatedPassword, created: false };
}

/**
 * Administrative 'Reveal' logic.
 * RATIONALE: Allows teachers to provide temporary help to students, 
 * but forced audit ensures this isn't abused.
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
  if (!credential) throw new Error("Portal credential not found for customer.");
  if (!credential.isActive) throw new Error("Portal credential is inactive for customer.");

  const password = decryptPortalSecret(credential.passwordEncrypted);
  await writeCredentialAuditLog({
    db,
    customerId: input.customerId,
    credentialId: credential.id,
    actorId: input.actorId ?? null,
    action: "revealed",
    details: input.details || "Portal credential revealed by admin."
  });

  return { password, credential };
}
