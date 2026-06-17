import { prisma } from "@/lib/db";
import { logError, logEvent } from "@/lib/observability";
import { appendCreditLedgerEntry } from "@/lib/vouchers/account-credit";
import { normalizeVoucherCode } from "@/lib/vouchers/code";

/**
 * Result of a redemption attempt. `ok: false` carries a coarse reason for
 * server-side logging only — callers MUST translate any failure into a single
 * generic client message so the endpoint never becomes a validity oracle (i.e.
 * an attacker brute-forcing codes cannot tell "wrong code" from "already used"
 * from "expired").
 */
export type RedeemResult =
  | { ok: true; valueCents: number; newBalanceCents: number; voucherId: string }
  | { ok: false; reason: "not_found" | "not_active" | "expired" | "error" };

/**
 * Redeems a voucher into a customer's monetary account credit.
 *
 * SECURITY (real money):
 * - SINGLE REDEMPTION / NO DOUBLE-SPEND: the status flip from `active` to
 *   `redeemed` is performed with `updateMany WHERE status = active` inside a
 *   transaction. Two concurrent redemptions race on that guarded update; only
 *   the one whose update affects a row proceeds to write the credit ledger, so
 *   a voucher can fund exactly one ledger grant even under concurrency.
 * - SERIALIZABLE BALANCE: the transaction runs at Serializable isolation
 *   (mirroring apply-credit). The status guard only serializes redemptions of
 *   the SAME voucher; it does NOT serialize two DIFFERENT grants to the same
 *   customer (e.g. two distinct vouchers redeemed at once, or a redemption
 *   racing a credit application). Those read-then-write `balanceAfterCents`
 *   through appendCreditLedgerEntry, so without Serializable the later writer
 *   could compute its running balance from a stale prior balance and the
 *   customer would silently lose credit. Serializable forces the DB to abort
 *   the loser, which the caller can retry.
 * - DERIVE-AT-USE EXPIRY: expiry is evaluated here against `expiresAt`; an
 *   `active` but expired voucher is rejected (and not consumed).
 * - NO ORACLE: every failure returns a coarse reason for logs only; the caller
 *   maps all failures to one generic message.
 *
 * `redeemedByCustomerId` records who redeemed it (admin-applied or self-redeem).
 * `actorId` is the admin performing an admin-side redemption (null for student
 * self-redeem). The credit always lands on `customerId`.
 */
export async function redeemVoucherToAccountCredit(input: {
  rawCode: string;
  customerId: string;
  actorId?: string | null;
}): Promise<RedeemResult> {
  const code = normalizeVoucherCode(input.rawCode);
  if (!code) {
    return { ok: false, reason: "not_found" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findUnique({
        where: { code },
        select: { id: true, status: true, valueCents: true, expiresAt: true },
      });

      if (!voucher) {
        return { ok: false, reason: "not_found" } as const;
      }

      // Only an `active` voucher can be redeemed. pending/redeemed/void all fail.
      if (voucher.status !== "active") {
        return { ok: false, reason: "not_active" } as const;
      }

      // Derive-at-use expiry: a still-active voucher past its expiry is rejected.
      if (voucher.expiresAt.getTime() <= Date.now()) {
        return { ok: false, reason: "expired" } as const;
      }

      // ATOMIC SINGLE-REDEMPTION: flip active -> redeemed guarded by the current
      // status. A concurrent delivery loses the race and updates zero rows.
      const flipped = await tx.voucher.updateMany({
        where: { id: voucher.id, status: "active" },
        data: {
          status: "redeemed",
          redeemedAt: new Date(),
          redeemedByCustomerId: input.customerId,
        },
      });

      if (flipped.count === 0) {
        // Lost the race to a concurrent redemption; do NOT credit again.
        return { ok: false, reason: "not_active" } as const;
      }

      const newBalanceCents = await appendCreditLedgerEntry(
        {
          customerId: input.customerId,
          amountCents: voucher.valueCents,
          reason: "voucher_redemption",
          sourceVoucherId: voucher.id,
          note: "Voucher redeemed to account credit",
          createdById: input.actorId ?? null,
        },
        tx,
      );

      logEvent("voucher.redeemed", {
        voucherId: voucher.id,
        customerId: input.customerId,
        valueCents: voucher.valueCents,
        actorId: input.actorId ?? null,
      });

      return {
        ok: true,
        valueCents: voucher.valueCents,
        newBalanceCents,
        voucherId: voucher.id,
      } as const;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    logError("voucher.redeem_failed", error, { customerId: input.customerId });
    return { ok: false, reason: "error" };
  }
}
