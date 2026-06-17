import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { getDefaultCurrency } from "@/lib/branding";
import { getStripe } from "@/lib/stripe/client";
import { generateUniqueVoucherCode } from "@/lib/vouchers/code";
import { voucherExpiryFrom } from "@/lib/vouchers/expiry";

/**
 * Allowed gift-voucher denominations in cents. The buy endpoint accepts ONLY
 * these server-side values; the client never supplies an arbitrary amount, so a
 * tampered request cannot mint a voucher worth more than it paid for. Keep this
 * the single source of truth shared by the buy page UI and the API.
 */
export const VOUCHER_DENOMINATIONS_CENTS = [5000, 10000, 15000, 20000, 30000, 50000] as const;

export type VoucherDenominationCents = (typeof VOUCHER_DENOMINATIONS_CENTS)[number];

/**
 * Type guard: is `value` one of the allowed denominations? Used to reject any
 * client-supplied amount that is not on the server-side allow-list.
 */
export function isAllowedVoucherDenomination(value: unknown): value is VoucherDenominationCents {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (VOUCHER_DENOMINATIONS_CENTS as readonly number[]).includes(value)
  );
}

/** Recipient/purchaser details captured at buy time. */
export type VoucherPurchaseDetails = {
  valueCents: VoucherDenominationCents;
  purchaserName: string;
  purchaserEmail: string;
  recipientName: string;
  recipientEmail: string;
  message?: string | null;
};

/**
 * Creates a `pending` voucher row (awaiting Stripe payment) with a unique code
 * and a six-month expiry, then opens a Stripe Checkout Session that references
 * the voucher via `metadata.voucherId`.
 *
 * SECURITY:
 * - The charged amount is taken server-side from the allow-listed denomination;
 *   the client never supplies the Stripe `unit_amount`. The webhook re-verifies
 *   amount + currency against the voucher before activating it.
 * - The code is generated up-front but the voucher is only usable once the
 *   webhook flips it to `active`; a `pending` voucher cannot be redeemed.
 * - The Stripe idempotency key is derived from the voucher id so a double-submit
 *   of the same just-created voucher reuses one session.
 */
export async function createVoucherCheckoutSession(
  details: VoucherPurchaseDetails,
  baseUrl: string,
): Promise<{ voucherId: string; session: Stripe.Checkout.Session }> {
  const currency = getDefaultCurrency();
  const code = await generateUniqueVoucherCode();

  const voucher = await prisma.voucher.create({
    data: {
      code,
      valueCents: details.valueCents,
      currency,
      status: "pending",
      purchaserName: details.purchaserName,
      purchaserEmail: details.purchaserEmail,
      recipientName: details.recipientName,
      recipientEmail: details.recipientEmail,
      message: details.message ?? null,
      expiresAt: voucherExpiryFrom(),
    },
    select: { id: true, valueCents: true, currency: true },
  });

  const stripe = getStripe();
  const trimmedBase = baseUrl.replace(/\/+$/, "");

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      // Pre-fill the buyer's email on the Stripe page; receipt goes here.
      customer_email: details.purchaserEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: voucher.currency.toLowerCase(),
            unit_amount: voucher.valueCents,
            product_data: {
              name: "Gift voucher",
            },
          },
        },
      ],
      metadata: {
        voucherId: voucher.id,
      },
      success_url: `${trimmedBase}/vouchers/success`,
      cancel_url: `${trimmedBase}/vouchers/cancelled`,
    },
    {
      idempotencyKey: `voucher-checkout-${voucher.id}`,
    },
  );

  await prisma.voucher.update({
    where: { id: voucher.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return { voucherId: voucher.id, session };
}
