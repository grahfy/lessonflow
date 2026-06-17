import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { sendTemplateEmail } from "@/lib/email/service";
import { customerGiftVoucherTemplate } from "@/lib/email/templates";
import { getPublicSiteUrl } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";

/**
 * Fulfils a gift-voucher purchase from a completed Stripe Checkout Session.
 *
 * Invoked from the Stripe webhook for sessions carrying `metadata.voucherId`
 * (the voucher branch of handleCheckoutCompleted).
 *
 * SECURITY / IDEMPOTENCY (real money):
 * - Activates the voucher exactly once: the `pending -> active` flip is a
 *   guarded `updateMany WHERE status = pending`, so a duplicate webhook delivery
 *   (or the async-payment-succeeded follow-up) updates zero rows and does NOT
 *   re-send the code email. The recipient is therefore emailed the live code at
 *   most once.
 * - Re-verifies amount + currency against the stored voucher before activating;
 *   a mismatch is logged and the voucher is left pending (never activated on a
 *   tampered/short payment).
 * - Only activates when session.payment_status === "paid" (async methods may
 *   complete unpaid and clear later).
 */
export async function fulfilVoucherFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const voucherId = session.metadata?.voucherId;
  if (!voucherId) {
    return;
  }

  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
    select: {
      id: true,
      status: true,
      code: true,
      valueCents: true,
      currency: true,
      recipientName: true,
      recipientEmail: true,
      purchaserName: true,
      message: true,
      expiresAt: true,
    },
  });

  if (!voucher) {
    logError("stripe.webhook_voucher_not_found", new Error("Voucher referenced by session not found"), {
      sessionId: session.id,
      voucherId,
    });
    return;
  }

  // Idempotency: an already-active (or redeemed/void) voucher is a no-op so a
  // retried delivery never re-emails the code.
  if (voucher.status !== "pending") {
    logEvent("stripe.webhook_voucher_not_pending_ignored", {
      voucherId,
      sessionId: session.id,
      status: voucher.status,
    });
    return;
  }

  // Funds must have actually cleared.
  if (session.payment_status !== "paid") {
    logEvent("stripe.webhook_voucher_session_unpaid", {
      voucherId,
      sessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return;
  }

  // Verify the buyer paid the right amount in the right currency.
  const amountMatches = session.amount_total === voucher.valueCents;
  const currencyMatches =
    typeof session.currency === "string" &&
    session.currency.toLowerCase() === voucher.currency.toLowerCase();

  if (!amountMatches || !currencyMatches) {
    logError("stripe.webhook_voucher_amount_mismatch", new Error("Session amount/currency did not match voucher"), {
      voucherId,
      sessionId: session.id,
      sessionAmount: session.amount_total,
      sessionCurrency: session.currency,
      voucherValue: voucher.valueCents,
      voucherCurrency: voucher.currency,
    });
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  // Guarded activation: only the delivery that flips pending -> active proceeds
  // to email the code (count === 1). Concurrent/duplicate deliveries get 0.
  const activated = await prisma.voucher.updateMany({
    where: { id: voucher.id, status: "pending" },
    data: {
      status: "active",
      paidVia: "stripe",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
    },
  });

  if (activated.count === 0) {
    logEvent("stripe.webhook_voucher_concurrent_activation_ignored", {
      voucherId,
      sessionId: session.id,
    });
    return;
  }

  logEvent("stripe.webhook_voucher_activated", {
    voucherId,
    sessionId: session.id,
    paymentIntentId,
  });

  // Email the code to the recipient exactly once. A delivery failure is logged
  // but does NOT throw: the voucher is already active and an admin can resend;
  // throwing would make Stripe retry and risk a double-activation attempt (the
  // guard above would block re-activation but we avoid the churn).
  if (voucher.recipientEmail) {
    try {
      await sendTemplateEmail({
        to: voucher.recipientEmail,
        templateKey: "gift_voucher_delivery",
        context: {
          recipientName: voucher.recipientName ?? "",
          code: voucher.code,
        },
        fallbackRenderer: () =>
          customerGiftVoucherTemplate({
            recipientName: voucher.recipientName ?? "there",
            purchaserName: voucher.purchaserName,
            code: voucher.code,
            valueCents: voucher.valueCents,
            expiresAt: voucher.expiresAt,
            message: voucher.message,
            redeemUrl: `${getPublicSiteUrl().replace(/\/+$/, "")}/student/login`,
          }),
        // The voucher code is a bearer credential: never BCC it to the audit
        // mailbox, and bypass the automated-notification toggle (transactional).
        skipAuditBcc: true,
        skipNotificationPolicyCheck: true,
      });
      logEvent("voucher.code_emailed", { voucherId, sessionId: session.id });
    } catch (error) {
      logError("voucher.code_email_failed", error, { voucherId, sessionId: session.id });
    }
  }
}
