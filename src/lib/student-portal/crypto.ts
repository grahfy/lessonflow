import crypto from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Derives a deterministic 32-byte key from configured secret material.
 * This keeps operator setup simple while ensuring the cipher always receives
 * a valid key length for AES-256-GCM.
 */
function deriveEncryptionKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY is required.");
  }
  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
}

/**
 * Reads and derives the active student-portal encryption key from environment.
 */
function getActiveEncryptionKey(): Buffer {
  const explicit = process.env.STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY?.trim();
  if (explicit) {
    return deriveEncryptionKey(explicit);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY is required in production.");
  }

  const fallback = process.env.ADMIN_SESSION_SECRET || "dev-student-portal-encryption-key";
  return deriveEncryptionKey(fallback);
}

/**
 * Encrypts a portal password for at-rest storage using authenticated encryption.
 * Output format: `v1.<iv>.<ciphertext>.<authTag>` (base64url segments).
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
 * Decrypts an encrypted portal password and validates integrity/authenticity.
 */
export function decryptPortalSecret(payload: string): string {
  const [version, ivRaw, ciphertextRaw, tagRaw] = payload.split(".");
  if (version !== "v1" || !ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Invalid portal credential payload format.");
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
