import type { CreditLedgerReason, Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** A Prisma client or interactive transaction client. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Returns the customer's current monetary account-credit balance in cents.
 *
 * The ledger is append-only and each row stores `balanceAfterCents`, so the
 * current balance is simply the most recent row's running balance (0 when the
 * customer has no ledger history). Ordered by createdAt then id to break ties
 * deterministically for rows written within the same millisecond.
 */
export async function getAccountCreditBalanceCents(
  customerId: string,
  client: PrismaLike = prisma,
): Promise<number> {
  const latest = await client.customerCreditLedger.findFirst({
    where: { customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { balanceAfterCents: true },
  });
  return latest?.balanceAfterCents ?? 0;
}

/** Input for appending one entry to a customer's account-credit ledger. */
type AppendLedgerEntryInput = {
  customerId: string;
  /** Signed change in cents: positive = grant/credit, negative = debit/apply. */
  amountCents: number;
  reason: CreditLedgerReason;
  sourceVoucherId?: string | null;
  sourceInvoiceId?: string | null;
  note?: string | null;
  createdById?: string | null;
};

/**
 * Appends a signed entry to the customer's account-credit ledger inside the
 * given transaction, computing the new running balance from the prior balance.
 *
 * SECURITY / INVARIANTS:
 * - Must be called inside a SERIALIZABLE interactive transaction so the
 *   read-of-balance and the write happen atomically AND are isolated against a
 *   concurrent grant/debit to the same customer; callers pass `tx`. Passing the
 *   base (non-transaction) client compiles but loses the concurrency guarantee
 *   and can understate the running balance under contention — callers that are
 *   not already in a transaction MUST use `appendCreditLedgerEntrySafe` instead.
 * - The resulting balance must never go negative. A debit larger than the
 *   available balance throws rather than writing a negative ledger row, so an
 *   over-application of credit can never silently create phantom money.
 *
 * Returns the new balance in cents.
 */
export async function appendCreditLedgerEntry(
  input: AppendLedgerEntryInput,
  tx: PrismaLike,
): Promise<number> {
  const previousBalance = await getAccountCreditBalanceCents(input.customerId, tx);
  const newBalance = previousBalance + input.amountCents;

  if (newBalance < 0) {
    // Guard against double-spend / over-application: never persist negative credit.
    throw new Error("Account credit balance cannot go negative.");
  }

  await tx.customerCreditLedger.create({
    data: {
      customerId: input.customerId,
      amountCents: input.amountCents,
      balanceAfterCents: newBalance,
      reason: input.reason,
      sourceVoucherId: input.sourceVoucherId ?? null,
      sourceInvoiceId: input.sourceInvoiceId ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });

  return newBalance;
}

/**
 * Race-safe standalone ledger append for callers that are NOT already inside a
 * transaction (e.g. an admin comp account-credit grant invoked directly from a
 * route handler).
 *
 * Opens its own `Serializable` transaction so the balance read and the write
 * are isolated against any concurrent grant/debit to the same customer. This is
 * the equivalent guarantee that redeem.ts and apply-credit.ts get by running
 * `appendCreditLedgerEntry` inside their own Serializable transactions: without
 * it, two concurrent same-customer grants could both read the same prior
 * balance and the later writer would understate `balanceAfterCents`, silently
 * losing credit.
 *
 * Prefer this over calling `appendCreditLedgerEntry(input, prisma)` directly.
 *
 * Returns the new balance in cents.
 */
export async function appendCreditLedgerEntrySafe(
  input: AppendLedgerEntryInput,
  client: PrismaClient = prisma,
): Promise<number> {
  return client.$transaction(
    (tx) => appendCreditLedgerEntry(input, tx),
    { isolationLevel: "Serializable" },
  );
}
