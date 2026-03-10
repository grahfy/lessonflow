/**
 * Student Portal Credential Encryption Service
 * 
 * Provides authenticated encryption for sensitive student portal credentials.
 * Unlike admin passwords (which are one-way hashed), portal passwords for 
 * legacy/linked systems may need to be retrieved in plaintext to proxy 
 * authentication requests.
 * 
 * DESIGN RATIONALE:
 * 1. AES-256-GCM: We use Galois/Counter Mode (GCM) which provides both 
 *    confidentiality and authenticity (AEAD). This ensures that a payload 
 *    cannot be tampered with in the database without decryption failing.
 * 2. Key Derivation: Sourced from `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY`. 
 *    We derive a 32-byte key using SHA-256 to ensure compatibility with 
 *    the AES-256 requirement regardless of the input secret's length.
 * 3. Versioned Payloads: Encrypted strings are prefixed with a version 'v1' 
 *    to allow for algorithm rotation in the future without breaking existing data.
 */

import crypto from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Ensures the cryptographic key is exactly 32 bytes.
 */
function deriveEncryptionKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY is required for security.");
  }
  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
}

/**
 * Resolves the primary encryption secret from environment.
 */
function getActiveEncryptionKey(): Buffer {
  const explicit = process.env.STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY?.trim();
  if (explicit) {
    return deriveEncryptionKey(explicit);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Critical Failure: STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY is missing in production.");
  }

  const fallback = process.env.ADMIN_SESSION_SECRET || "dev-student-portal-encryption-key";
  return deriveEncryptionKey(fallback);
}

/**
 * Transforms a plaintext secret into an encrypted blob.
 * 
 * Format: `v1.<iv>.<ciphertext>.<authTag>`
 * - iv: Initialization vector (unique per encryption)
 * - ciphertext: The encrypted data
 * - authTag: The GCM authentication tag
 * 
 * @param plaintext - The raw credential string
 * @returns Base64URL encoded aggregate string
 */
export function encryptPortalSecret(plaintext: string): string {
  const key = getActiveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    authTag.toString("base64url")
  ].join(".");
}

/**
 * Reverses the encryption and verifies the authenticity tag.
 * 
 * @throws Error if the payload is malformed or the authentication tag is invalid.
 */
export function decryptPortalSecret(payload: string): string {
  const parts = payload.split(".");
  const [version, ivRaw, ciphertextRaw, tagRaw] = parts;

  if (version !== "v1" || !ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Malformed portal credential payload. Possible corruption or invalid key version.");
  }

  const key = getActiveEncryptionKey();
  const iv = Buffer.from(ivRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");
  const authTag = Buffer.from(tagRaw, "base64url");
  
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
