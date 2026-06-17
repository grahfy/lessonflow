import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPublicSiteUrl } from "@/lib/env";
import { logError } from "@/lib/observability";
import { consumeRateLimit, getRequestIpFromHeaders } from "@/lib/rate-limit";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  VOUCHER_DENOMINATIONS_CENTS,
  createVoucherCheckoutSession,
} from "@/lib/vouchers/purchase";

export const dynamic = "force-dynamic";

/**
 * Validates the buy form. The amount must be one of the server-side allow-listed
 * denominations (coerced from the form's string value); no free-form amounts are
 * accepted so a tampered request can never set its own price.
 */
const buyVoucherSchema = z.object({
  valueCents: z.coerce
    .number()
    .int()
    .refine(
      (value): value is (typeof VOUCHER_DENOMINATIONS_CENTS)[number] =>
        (VOUCHER_DENOMINATIONS_CENTS as readonly number[]).includes(value),
      { message: "Unsupported voucher amount." },
    ),
  purchaserName: z.string().trim().min(1).max(200),
  purchaserEmail: z.string().trim().email().max(320),
  recipientName: z.string().trim().min(1).max(200),
  recipientEmail: z.string().trim().email().max(320),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Public endpoint that opens a Stripe Checkout Session for a gift voucher and
 * redirects the buyer to Stripe's hosted page.
 *
 * SECURITY: unauthenticated. The charged amount is taken server-side from an
 * allow-listed denomination; the client never supplies the price. Per-IP rate
 * limited to bound Stripe session creation. No request data is reflected in
 * responses. The webhook re-verifies amount + currency before activating the
 * voucher and emailing the code.
 */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Voucher purchase is not available." },
      { status: 503 },
    );
  }

  // Throttle per-IP so the public form cannot be used to spawn unbounded Stripe
  // Checkout Sessions (API-cost / load abuse) or to mass-create pending vouchers.
  const rate = consumeRateLimit({
    key: `voucher-buy:${getRequestIpFromHeaders(request.headers)}`,
    limit: 10,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  // Accept either browser form submissions (from the buy page) or JSON clients.
  let raw: Record<string, unknown> | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    raw = await request.json().catch(() => null);
  } else {
    const form = await request.formData().catch(() => null);
    raw = form ? Object.fromEntries(form.entries()) : null;
  }

  const parsed = buyVoucherSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  try {
    const { session } = await createVoucherCheckoutSession(
      {
        valueCents: parsed.data.valueCents,
        purchaserName: parsed.data.purchaserName,
        purchaserEmail: parsed.data.purchaserEmail,
        recipientName: parsed.data.recipientName,
        recipientEmail: parsed.data.recipientEmail,
        message: parsed.data.message ?? null,
      },
      getPublicSiteUrl(),
    );

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    // 303 so the browser issues a GET to the Stripe-hosted URL after the POST.
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    logError("voucher.stripe_checkout_failed", error);
    return NextResponse.json(
      { error: "Unable to start purchase. Please try again later." },
      { status: 502 },
    );
  }
}
