import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * Number of random bytes backing a pay token. 32 bytes (256 bits) of CSPRNG
 * output rendered as base64url is unguessable and collision-resistant for the
 * volume of invoices this app will ever issue.
 */
const PAY_TOKEN_BYTES = 32;

/** A Prisma client or interactive transaction client. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Generates a cryptographically-random, URL-safe pay token. The token is the
 * sole bearer credential for the public pay page, so it must come from a CSPRNG.
 */
export function generatePayToken(): string {
  return randomBytes(PAY_TOKEN_BYTES).toString("base64url");
}

/**
 * Ensures the given invoice has a `payToken`, generating and persisting one if
 * it is missing. Returns the token. Safe to call repeatedly (idempotent): an
 * existing token is reused so previously-shared pay links keep working.
 *
 * Wire this into the invoice send flow so a token exists by the time a customer
 * could receive a pay link.
 */
export async function ensurePayToken(
  invoice: { id: string; payToken: string | null },
  client: PrismaLike = prisma,
): Promise<string> {
  if (invoice.payToken) {
    return invoice.payToken;
  }
  const token = generatePayToken();
  await client.invoice.update({
    where: { id: invoice.id },
    data: { payToken: token },
  });
  return token;
}

/**
 * Builds the absolute public pay URL for a token. `baseUrl` should be the
 * canonical site URL (see getPublicSiteUrl); a trailing slash is tolerated.
 */
export function invoicePayUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/pay/${encodeURIComponent(token)}`;
}
