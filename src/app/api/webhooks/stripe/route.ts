import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { logError, logEvent } from "@/lib/observability";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { grantCreditsForPaidInvoice } from "@/lib/credits/lesson-credits";
import { fulfilVoucherFromSession } from "@/lib/vouchers/fulfill";

// Stripe signature verification needs the exact raw request body, so this route
// must run on the Node runtime and never have its body parsed/cached upstream.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver.
 *
 * SECURITY:
 * - The signature is verified against the RAW body using STRIPE_WEBHOOK_SECRET;
 *   missing/invalid signatures are rejected with 400.
 * - `checkout.session.completed` handling is idempotent (a duplicate delivery
 *   for an already-paid invoice is a no-op) so Stripe retries are safe.
 * - The session's payment_status, amount_total and currency are re-verified against
 *   the invoice before it is marked paid; client/session-supplied values are never
 *   trusted and async sessions that have not yet cleared are left unpaid.
 * - Responds 200 quickly on success so Stripe does not retry unnecessarily.
 */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Without a configured secret we cannot verify signatures; refuse rather
    // than process unverified events.
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    logError("stripe.webhook_signature_invalid", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    // checkout.session.completed fires for synchronous payments; for delayed/async
    // payment methods Stripe later sends checkout.session.async_payment_succeeded once
    // funds clear. Both are funnelled through the same handler, which only marks paid
    // when session.payment_status === "paid".
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await handleCheckoutCompleted(event.data.object);
    }
  } catch (error) {
    // Surface a 500 so Stripe retries; the handler is idempotent so retries are
    // safe and a transient DB failure should not silently drop the payment.
    logError("stripe.webhook_handler_failed", error, { eventType: event.type, eventId: event.id });
    return NextResponse.json({ error: "Webhook handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Marks the referenced invoice paid exactly once, after verifying the paid
 * amount and currency match the invoice.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // A checkout session belongs to exactly one product flow, identified by which
  // metadata key it carries. Voucher purchases are fulfilled on their own branch
  // (activate + email the code) and never touch the invoice path below.
  if (session.metadata?.voucherId) {
    await fulfilVoucherFromSession(session);
    return;
  }

  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) {
    logError("stripe.webhook_missing_invoice_metadata", new Error("checkout.session.completed without metadata.invoiceId"), {
      sessionId: session.id,
    });
    return;
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      isDeleted: true,
      currency: true,
      totalCents: true,
    },
  });

  if (!invoice || invoice.isDeleted) {
    logError("stripe.webhook_invoice_not_found", new Error("Invoice referenced by session not found"), {
      sessionId: session.id,
      invoiceId,
    });
    return;
  }

  // Idempotency: a duplicate delivery for an already-paid invoice is a no-op.
  if (invoice.status === "paid") {
    logEvent("stripe.webhook_duplicate_paid_ignored", { invoiceId, sessionId: session.id });
    return;
  }

  // Only an invoice that was actually sent should be transitioned to paid by a
  // payment event (mirrors the admin mark_paid FSM rule of sent -> paid).
  if (invoice.status !== "sent") {
    logError("stripe.webhook_invoice_not_payable", new Error(`Invoice in non-payable status: ${invoice.status}`), {
      invoiceId,
      sessionId: session.id,
      status: invoice.status,
    });
    return;
  }

  // Confirm funds actually cleared. For delayed/async payment methods a session can
  // complete with payment_status "unpaid"/"no_payment_required"; we must not mark paid
  // until Stripe reports "paid" (it later sends checkout.session.async_payment_succeeded
  // once the payment clears, which is handled the same way).
  if (session.payment_status !== "paid") {
    logEvent("stripe.webhook_session_unpaid", {
      invoiceId,
      sessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return;
  }

  // Verify the customer paid the right amount in the right currency before we
  // trust this event. Never mark paid on a mismatch.
  const amountMatches = session.amount_total === invoice.totalCents;
  const currencyMatches =
    typeof session.currency === "string" &&
    session.currency.toLowerCase() === invoice.currency.toLowerCase();

  if (!amountMatches || !currencyMatches) {
    logError("stripe.webhook_amount_mismatch", new Error("Session amount/currency did not match invoice"), {
      invoiceId,
      sessionId: session.id,
      sessionAmount: session.amount_total,
      sessionCurrency: session.currency,
      invoiceTotal: invoice.totalCents,
      invoiceCurrency: invoice.currency,
    });
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  // Guard the transition with a status check inside the update so two concurrent
  // deliveries cannot both mark paid (the second updates zero rows).
  const result = await prisma.invoice.updateMany({
    where: { id: invoice.id, status: "sent" },
    data: {
      status: "paid",
      paidAt: new Date(),
      paidVia: "stripe",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
    },
  });

  if (result.count === 0) {
    // Lost the race to a concurrent delivery; the other one recorded the audit.
    logEvent("stripe.webhook_concurrent_paid_ignored", { invoiceId, sessionId: session.id });
    return;
  }

  await prisma.invoiceAuditLog.create({
    data: {
      invoiceId: invoice.id,
      action: "marked_paid",
      actorId: null,
      details: "Invoice marked as paid via Stripe",
    },
  });

  logEvent("stripe.webhook_invoice_marked_paid", {
    invoiceId,
    sessionId: session.id,
    paymentIntentId,
  });

  // Grant any prepaid lesson credits for package line items on this invoice.
  // Best-effort + idempotent (keyed on sourceInvoiceId) so a webhook retry after
  // the paid transition cannot double-grant, and a failure here cannot prevent
  // the 200 response (it would only trigger a safe idempotent retry).
  try {
    await grantCreditsForPaidInvoice(invoice.id);
  } catch (creditError) {
    logError("lesson_credits.grant_failed_webhook", creditError, { invoiceId: invoice.id });
  }
}
