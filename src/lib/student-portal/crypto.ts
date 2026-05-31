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
 * 2. Key Derivation: Sourced from `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY`,
 *    which is REQUIRED (>=32 chars) in every environment — there is no
 *    fail-open fallback. New blobs derive a 32-byte key via scrypt + a fixed
 *    application salt (a real KDF). Legacy `v1.` blobs are still decryptable
 *    using the original single-pass SHA-256 derivation so existing data keeps
 *    working until it is re-encrypted (any rotate/reveal-then-rotate upgrades
 *    a record to `v2.`).
 * 3. Versioned Payloads: Encrypted strings are prefixed with `v1`/`v2` to allow
 *    algorithm/KDF rotation without breaking existing data.
 */

import crypto from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const MIN_SECRET_LENGTH = 32;
/** Fixed application salt for scrypt key derivation (v2 blobs). */
const SCRYPT_SALT = "mgs-student-portal-credential-v2";

/**
 * Resolves and validates the configured encryption secret.
 *
 * SECURITY: Required in ALL environments (no NODE_ENV-gated fallback) and must
 * be at least 32 chars so the derived AES-256 key has adequate entropy.
 */
function getEncryptionSecret(): string {
  const secret = process.env.STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY is required for security.");
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY must be at least ${MIN_SECRET_LENGTH} characters.`
    );
  }
  return secret;
}

/** Legacy v1 key derivation: single-pass SHA-256 of the secret. */
function deriveLegacyV1Key(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/** Current v2 key derivation: scrypt(secret, fixed app salt) -> 32 bytes. */
function deriveScryptKey(secret: string): Buffer {
  return crypto.scryptSync(secret, SCRYPT_SALT, KEY_LENGTH_BYTES);
}

/**
 * Transforms a plaintext secret into an encrypted blob.
 *
 * Format: `v2.<iv>.<ciphertext>.<authTag>`
 * - iv: Initialization vector (unique per encryption)
 * - ciphertext: The encrypted data
 * - authTag: The GCM authentication tag
 *
 * New blobs are always written as `v2` (scrypt-derived key). Legacy `v1` blobs
 * remain readable by `decryptPortalSecret`.
 *
 * @param plaintext - The raw credential string
 * @returns Base64URL encoded aggregate string
 */
export function encryptPortalSecret(plaintext: string): string {
  const key = deriveScryptKey(getEncryptionSecret());
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v2",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    authTag.toString("base64url")
  ].join(".");
}

/**
 * Reverses the encryption and verifies the authenticity tag.
 *
 * Supports both `v2` (scrypt KDF) and legacy `v1` (SHA-256 KDF) blobs so
 * existing data decrypts without a forced re-encryption.
 *
 * @throws Error if the payload is malformed or the authentication tag is invalid.
 */
export function decryptPortalSecret(payload: string): string {
  const parts = payload.split(".");
  const [version, ivRaw, ciphertextRaw, tagRaw] = parts;

  if ((version !== "v1" && version !== "v2") || !ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Malformed portal credential payload. Possible corruption or invalid key version.");
  }

  const secret = getEncryptionSecret();
  const key = version === "v2" ? deriveScryptKey(secret) : deriveLegacyV1Key(secret);
  const iv = Buffer.from(ivRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");
  const authTag = Buffer.from(tagRaw, "base64url");

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
