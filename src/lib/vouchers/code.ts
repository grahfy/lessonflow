import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** A Prisma client or interactive transaction client. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Voucher-code alphabet. Crockford-style: uppercase letters + digits with the
 * visually ambiguous characters (0/O, 1/I/L) removed so a recipient can read a
 * code off an email/print and type it back without confusion. 32 symbols.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Number of groups and the length of each group in a generated code. */
const GROUP_COUNT = 3;
const GROUP_LENGTH = 4;
/** Total random characters across all groups (e.g. 3 x 4 = 12). */
const CODE_CHARS = GROUP_COUNT * GROUP_LENGTH;

/** How many times to retry on a (vanishingly unlikely) collision before giving up. */
const MAX_COLLISION_RETRIES = 5;

/**
 * Draws `count` characters uniformly from CODE_ALPHABET using CSPRNG bytes.
 *
 * SECURITY: the code is a bearer credential worth real money, so it must come
 * from a CSPRNG. To avoid modulo bias (the alphabet length, 31, does not divide
 * 256 evenly) we use rejection sampling: bytes >= the largest multiple of the
 * alphabet length are discarded and re-drawn rather than folded with `%`.
 */
function randomCodeChars(count: number): string {
  const alphabetLength = CODE_ALPHABET.length;
  // Largest multiple of alphabetLength that fits in a byte; bytes at/above this
  // bound would bias the distribution and are rejected.
  const unbiasedCeiling = Math.floor(256 / alphabetLength) * alphabetLength;

  let out = "";
  while (out.length < count) {
    // Over-draw to amortise the syscall; most bytes are accepted.
    const buffer = randomBytes(count * 2);
    for (let i = 0; i < buffer.length && out.length < count; i += 1) {
      const byte = buffer[i];
      if (byte >= unbiasedCeiling) {
        continue; // reject to avoid modulo bias
      }
      out += CODE_ALPHABET[byte % alphabetLength];
    }
  }
  return out;
}

/**
 * Formats a flat character string into hyphenated groups (e.g. ABCD-EFGH-JKLM).
 */
function groupCode(chars: string): string {
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += GROUP_LENGTH) {
    groups.push(chars.slice(i, i + GROUP_LENGTH));
  }
  return groups.join("-");
}

/**
 * Generates a single random, grouped, uppercase-alphanumeric voucher code such
 * as `ABCD-EFGH-JKLM`. Not yet checked for uniqueness — use
 * {@link generateUniqueVoucherCode} for that.
 */
export function generateVoucherCode(): string {
  return groupCode(randomCodeChars(CODE_CHARS));
}

/**
 * Canonicalises a voucher code for storage AND lookup so they always agree.
 *
 * CANONICAL FORM: uppercase, grouped with hyphens exactly as
 * {@link generateVoucherCode} emits (e.g. `ABCD-EFGH-JKLM`). This is the form
 * persisted in the `Voucher.code` column, so it must also be the form that
 * lookups (redeem) compare against.
 *
 * A user reading a code off an email/print may retype it with spaces, no
 * hyphens, lowercase, or extra punctuation. We strip everything that is not an
 * alphanumeric, uppercase, then re-insert the canonical group hyphens. This
 * makes hyphen/space/case variants all resolve to the same stored value while
 * keeping the readable, hyphenated display form intact.
 */
export function normalizeVoucherCode(raw: string): string {
  const stripped = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!stripped) {
    return "";
  }
  return groupCode(stripped);
}

/**
 * Generates a voucher code that is not already present in the Voucher table.
 *
 * Collisions are astronomically unlikely (31^12 ≈ 7.9e17 of keyspace) but the
 * unique DB constraint is the real guarantee; this loop just avoids surfacing a
 * constraint error on the (practically impossible) clash. Pass a transaction
 * client when generating inside a wider transaction.
 */
export async function generateUniqueVoucherCode(client: PrismaLike = prisma): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const code = generateVoucherCode();
    const existing = await client.voucher.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }
  // Exhausting retries means either an extraordinary RNG fault or a saturated
  // keyspace; surface loudly rather than risk returning a duplicate.
  throw new Error("Unable to generate a unique voucher code after multiple attempts.");
}
