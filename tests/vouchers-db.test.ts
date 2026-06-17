/**
 * DB-backed integration tests for vouchers (phase1-leftovers, workstream C).
 *
 * Exercises the real voucher domain logic against the test DB:
 *  - code gen: format, uniqueness, normalization, and distribution sanity
 *    (no obvious modulo bias).
 *  - fulfilVoucherFromSession: pending -> active on a paid session; idempotent
 *    (a duplicate delivery does not re-activate / re-email); amount + currency
 *    verified (a short/tampered payment leaves the voucher pending); the
 *    recipient is emailed AT MOST once. The email service is mocked so we can
 *    count sends without sending mail.
 *  - redeemVoucherToAccountCredit: a valid active voucher credits the ledger;
 *    expiry is rejected at redeem; single-redemption is atomic (a second
 *    redemption does not credit again); failures are oracle-free (generic
 *    coarse reasons only — never leaking which guard failed to the caller as a
 *    distinguishable value beyond the documented reason union).
 *  - void: a voided voucher cannot be redeemed.
 *
 * Seeded rows use the `vch_test_` prefix and are removed before/after each test.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ONLY the email service so fulfilment can run against the real DB without
// sending mail. Everything else (prisma, code gen, stripe types) is real.
const { mockSendTemplateEmail } = vi.hoisted(() => ({
  mockSendTemplateEmail: vi.fn(async () => ({ ok: true }))
}));
vi.mock("@/lib/email/service", () => ({
  sendTemplateEmail: mockSendTemplateEmail
}));

import { prisma } from "@/lib/db";
import {
  generateVoucherCode,
  generateUniqueVoucherCode,
  normalizeVoucherCode
} from "@/lib/vouchers/code";
import { voucherExpiryFrom, VOUCHER_VALIDITY_MONTHS } from "@/lib/vouchers/expiry";
import { fulfilVoucherFromSession } from "@/lib/vouchers/fulfill";
import { redeemVoucherToAccountCredit } from "@/lib/vouchers/redeem";
import { getAccountCreditBalanceCents } from "@/lib/vouchers/account-credit";

const PREFIX = "vch_test_";
const CODE_PREFIX = "VCHTEST"; // distinct code namespace for seeded vouchers

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedCustomer(id: string) {
  await prisma.customer.create({
    data: {
      id,
      fullName: "Voucher Customer",
      email: `${id}@example.com`,
      phone: "0400000000",
      normalizedEmail: `${id}@example.com`,
      normalizedPhone: "0400000000"
    }
  });
}

/** Seed a voucher row. `code` defaults to a unique namespaced value. */
async function seedVoucher(input: {
  id: string;
  code?: string;
  status: "pending" | "active" | "redeemed" | "void";
  valueCents?: number;
  currency?: string;
  expiresAt?: Date;
  recipientEmail?: string | null;
}) {
  await prisma.voucher.create({
    data: {
      id: input.id,
      code: input.code ?? `${CODE_PREFIX}-${input.id}`,
      valueCents: input.valueCents ?? 10000,
      currency: input.currency ?? "AUD",
      status: input.status,
      recipientName: "Recipient",
      recipientEmail: input.recipientEmail === undefined ? "recipient@example.com" : input.recipientEmail,
      purchaserName: "Buyer",
      purchaserEmail: "buyer@example.com",
      expiresAt: input.expiresAt ?? new Date(Date.now() + 30 * DAY_MS)
    }
  });
}

/** Minimal Stripe Checkout.Session shape the fulfilment helper reads. */
function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: `cs_${PREFIX}1`,
    payment_status: "paid",
    amount_total: 10000,
    currency: "aud",
    payment_intent: `pi_${PREFIX}1`,
    metadata: { voucherId: `${PREFIX}v1` },
    ...overrides
  } as unknown as import("stripe").Stripe.Checkout.Session;
}

async function voucherStatus(id: string): Promise<string | null> {
  const v = await prisma.voucher.findUnique({ where: { id }, select: { status: true } });
  return v?.status ?? null;
}

async function cleanup() {
  await prisma.customerCreditLedger.deleteMany({ where: { customerId: { startsWith: PREFIX } } });
  await prisma.voucher.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.voucher.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
  await prisma.customer.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe("vouchers (DB-backed)", () => {
  beforeEach(async () => {
    await cleanup();
    mockSendTemplateEmail.mockClear();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("code generation", () => {
    it("produces a grouped uppercase-alphanumeric code with no ambiguous chars", () => {
      const code = generateVoucherCode();
      // Three groups of four, hyphen-separated: ABCD-EFGH-JKLM.
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      // Ambiguous characters (0,O,1,I,L) are excluded from the alphabet.
      expect(code).not.toMatch(/[OIL01]/);
    });

    it("normalizes user input (trim, uppercase, strip spaces) preserving hyphens", () => {
      expect(normalizeVoucherCode("  abcd-efgh-jklm  ")).toBe("ABCD-EFGH-JKLM");
      expect(normalizeVoucherCode("ab cd-ef gh-jk lm")).toBe("ABCD-EFGH-JKLM");
    });

    it("generates unique codes across many draws (uniqueness + bias sanity)", async () => {
      const SAMPLES = 2000;
      const codes = new Set<string>();
      // Tally character frequency to catch a grossly biased distribution.
      const freq = new Map<string, number>();
      for (let i = 0; i < SAMPLES; i += 1) {
        const code = generateVoucherCode();
        codes.add(code);
        for (const ch of code.replace(/-/g, "")) {
          freq.set(ch, (freq.get(ch) ?? 0) + 1);
        }
      }
      // No collisions across 2000 draws of a ~7.9e17 keyspace.
      expect(codes.size).toBe(SAMPLES);

      // Bias sanity: every alphabet symbol should appear, and no symbol should
      // dominate. 30-symbol alphabet, 12 chars * 2000 = 24000 samples => ~800
      // expected per symbol. Allow a wide tolerance band; a modulo-biased
      // generator would push some symbols far outside it.
      const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".split("");
      const total = [...freq.values()].reduce((a, b) => a + b, 0);
      const expected = total / alphabet.length;
      for (const symbol of alphabet) {
        const count = freq.get(symbol) ?? 0;
        expect(count).toBeGreaterThan(expected * 0.5);
        expect(count).toBeLessThan(expected * 1.5);
      }
    });

    it("generateUniqueVoucherCode avoids an existing code", async () => {
      // Insert a voucher whose code we then assert is never returned.
      const code = await generateUniqueVoucherCode();
      await seedVoucher({ id: `${PREFIX}vUnique`, code, status: "active" });
      // A fresh unique code differs from the one we just persisted.
      const next = await generateUniqueVoucherCode();
      expect(next).not.toBe(code);
    });
  });

  describe("expiry", () => {
    it("derives expiry six calendar months from issue", () => {
      const issued = new Date("2026-01-15T00:00:00.000Z");
      const expiry = voucherExpiryFrom(issued);
      expect(VOUCHER_VALIDITY_MONTHS).toBe(6);
      expect(expiry.getUTCMonth()).toBe(6); // January (0) + 6 = July (6)
      expect(expiry.getUTCFullYear()).toBe(2026);
    });
  });

  describe("fulfilVoucherFromSession", () => {
    it("activates a pending voucher on a paid session and emails the code once", async () => {
      await seedVoucher({ id: `${PREFIX}v1`, status: "pending" });

      await fulfilVoucherFromSession(checkoutSession());

      expect(await voucherStatus(`${PREFIX}v1`)).toBe("active");
      const v = await prisma.voucher.findUnique({ where: { id: `${PREFIX}v1` } });
      expect(v?.paidVia).toBe("stripe");
      expect(v?.stripePaymentIntentId).toBe(`pi_${PREFIX}1`);
      expect(mockSendTemplateEmail).toHaveBeenCalledTimes(1);
    });

    it("is idempotent: a duplicate delivery does not re-activate or re-email", async () => {
      await seedVoucher({ id: `${PREFIX}v1`, status: "pending" });

      await fulfilVoucherFromSession(checkoutSession());
      await fulfilVoucherFromSession(checkoutSession());

      expect(await voucherStatus(`${PREFIX}v1`)).toBe("active");
      // The guarded pending->active flip means the second delivery is a no-op:
      // the recipient is emailed at most once.
      expect(mockSendTemplateEmail).toHaveBeenCalledTimes(1);
    });

    it("leaves the voucher pending and does not email on an amount mismatch", async () => {
      await seedVoucher({ id: `${PREFIX}v1`, status: "pending", valueCents: 10000 });

      // Buyer paid less than the voucher's value.
      await fulfilVoucherFromSession(checkoutSession({ amount_total: 5000 }));

      expect(await voucherStatus(`${PREFIX}v1`)).toBe("pending");
      expect(mockSendTemplateEmail).not.toHaveBeenCalled();
    });

    it("leaves the voucher pending on a currency mismatch", async () => {
      await seedVoucher({ id: `${PREFIX}v1`, status: "pending", currency: "AUD" });

      await fulfilVoucherFromSession(checkoutSession({ currency: "usd" }));

      expect(await voucherStatus(`${PREFIX}v1`)).toBe("pending");
      expect(mockSendTemplateEmail).not.toHaveBeenCalled();
    });

    it("does not activate when the session is not paid", async () => {
      await seedVoucher({ id: `${PREFIX}v1`, status: "pending" });

      await fulfilVoucherFromSession(checkoutSession({ payment_status: "unpaid" }));

      expect(await voucherStatus(`${PREFIX}v1`)).toBe("pending");
      expect(mockSendTemplateEmail).not.toHaveBeenCalled();
    });
  });

  describe("redeemVoucherToAccountCredit", () => {
    it("credits the customer's ledger for a valid active voucher", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedVoucher({ id: `${PREFIX}v1`, code: `${CODE_PREFIX}-REDEEM1`, status: "active", valueCents: 15000 });

      const result = await redeemVoucherToAccountCredit({
        rawCode: `${CODE_PREFIX}-REDEEM1`,
        customerId: `${PREFIX}cust1`
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.valueCents).toBe(15000);
        expect(result.newBalanceCents).toBe(15000);
      }
      expect(await voucherStatus(`${PREFIX}v1`)).toBe("redeemed");
      expect(await getAccountCreditBalanceCents(`${PREFIX}cust1`)).toBe(15000);
    });

    it("rejects an expired (but still active) voucher and does not credit", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedVoucher({
        id: `${PREFIX}v1`,
        code: `${CODE_PREFIX}-EXPIRED`,
        status: "active",
        valueCents: 10000,
        expiresAt: new Date(Date.now() - DAY_MS)
      });

      const result = await redeemVoucherToAccountCredit({
        rawCode: `${CODE_PREFIX}-EXPIRED`,
        customerId: `${PREFIX}cust1`
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("expired");
      }
      // Not consumed, no credit written.
      expect(await voucherStatus(`${PREFIX}v1`)).toBe("active");
      expect(await getAccountCreditBalanceCents(`${PREFIX}cust1`)).toBe(0);
    });

    it("is single-redemption: a second redeem does not credit again", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedVoucher({ id: `${PREFIX}v1`, code: `${CODE_PREFIX}-ONCE`, status: "active", valueCents: 12000 });

      const first = await redeemVoucherToAccountCredit({ rawCode: `${CODE_PREFIX}-ONCE`, customerId: `${PREFIX}cust1` });
      const second = await redeemVoucherToAccountCredit({ rawCode: `${CODE_PREFIX}-ONCE`, customerId: `${PREFIX}cust1` });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      // Exactly one ledger grant; balance is the single value, not doubled.
      expect(await getAccountCreditBalanceCents(`${PREFIX}cust1`)).toBe(12000);
      const grants = await prisma.customerCreditLedger.count({
        where: { customerId: `${PREFIX}cust1`, reason: "voucher_redemption" }
      });
      expect(grants).toBe(1);
    });

    it("two concurrent redemptions credit the ledger exactly once", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedVoucher({ id: `${PREFIX}v1`, code: `${CODE_PREFIX}-RACE`, status: "active", valueCents: 9000 });

      const attempt = () =>
        redeemVoucherToAccountCredit({ rawCode: `${CODE_PREFIX}-RACE`, customerId: `${PREFIX}cust1` });

      const [a, b] = await Promise.all([attempt(), attempt()]);

      const successes = [a, b].filter((r) => r.ok);
      // The atomic status flip guarantees a voucher funds exactly one grant.
      expect(successes.length).toBe(1);
      expect(await getAccountCreditBalanceCents(`${PREFIX}cust1`)).toBe(9000);
      expect(
        await prisma.customerCreditLedger.count({
          where: { customerId: `${PREFIX}cust1`, reason: "voucher_redemption" }
        })
      ).toBe(1);
    });

    it("returns a coarse generic reason for an unknown code (no oracle)", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      const result = await redeemVoucherToAccountCredit({
        rawCode: `${CODE_PREFIX}-NOPE-NOPE`,
        customerId: `${PREFIX}cust1`
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // The reason set is deliberately coarse; callers map ALL of these to one
        // generic client message so an attacker cannot distinguish causes.
        expect(["not_found", "not_active", "expired", "error"]).toContain(result.reason);
      }
    });

    it("refuses to redeem a void voucher", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedVoucher({ id: `${PREFIX}v1`, code: `${CODE_PREFIX}-VOID`, status: "void", valueCents: 10000 });

      const result = await redeemVoucherToAccountCredit({ rawCode: `${CODE_PREFIX}-VOID`, customerId: `${PREFIX}cust1` });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_active");
      }
      expect(await getAccountCreditBalanceCents(`${PREFIX}cust1`)).toBe(0);
    });

    it("refuses to redeem a pending (unpaid) voucher", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedVoucher({ id: `${PREFIX}v1`, code: `${CODE_PREFIX}-PENDING`, status: "pending", valueCents: 10000 });

      const result = await redeemVoucherToAccountCredit({ rawCode: `${CODE_PREFIX}-PENDING`, customerId: `${PREFIX}cust1` });
      expect(result.ok).toBe(false);
      expect(await getAccountCreditBalanceCents(`${PREFIX}cust1`)).toBe(0);
    });
  });
});
