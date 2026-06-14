import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe/client";

/**
 * The subset of invoice fields required to open a Checkout Session. Kept narrow
 * so callers can pass either a full Prisma record or a lighter projection.
 */
export type CheckoutInvoice = {
  id: string;
  invoiceNumber: string;
  currency: string;
  totalCents: number;
};

/**
 * Creates a Stripe Hosted Checkout Session (mode=payment) for an invoice and
 * persists the session id on the invoice for reconciliation/idempotency.
 *
 * SECURITY: the charged amount is taken server-side from `invoice.totalCents`;
 * the client never supplies an amount. The webhook re-verifies amount + currency
 * against the invoice before marking it paid.
 *
 * The Stripe idempotency key is derived from invoiceId + totalCents so repeated
 * "Pay now" clicks (same amount) reuse one session, while a changed total
 * produces a fresh session rather than charging a stale amount.
 */
export async function createInvoiceCheckoutSession(
  invoice: CheckoutInvoice,
  baseUrl: string,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const currency = invoice.currency.toLowerCase();

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: invoice.totalCents,
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
            },
          },
        },
      ],
      metadata: {
        invoiceId: invoice.id,
      },
      // Stripe appends its own query string to success_url; cancel returns the
      // payer to the public pay page where they can retry.
      success_url: `${trimmedBase}/pay/success?invoice=${encodeURIComponent(invoice.invoiceNumber)}`,
      cancel_url: `${trimmedBase}/pay/cancelled?invoice=${encodeURIComponent(invoice.invoiceNumber)}`,
    },
    {
      idempotencyKey: `invoice-checkout-${invoice.id}-${invoice.totalCents}`,
    },
  );

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return session;
}
