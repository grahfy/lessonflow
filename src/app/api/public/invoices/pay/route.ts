import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isInvoicePayable } from "@/lib/invoices/payable";
import { logError } from "@/lib/observability";
import { consumeRateLimit, getRequestIpFromHeaders } from "@/lib/rate-limit";
import { createInvoiceCheckoutSession } from "@/lib/stripe/checkout";
import { isStripeConfigured } from "@/lib/stripe/client";
import { getPublicSiteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Public endpoint that opens a Stripe Checkout Session for a tokenized invoice
 * and redirects the payer to Stripe's hosted page.
 *
 * SECURITY: the only credential is the pay token. The invoice must be in a
 * payable state ("sent", not paid/void/deleted) and the charged amount is taken
 * server-side from the invoice. No invoice data is returned in the response body.
 */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Online payment is not available." },
      { status: 503 },
    );
  }

  // SECURITY: throttle per-IP so a leaked/forwarded pay link cannot be used to
  // spawn unbounded Stripe Checkout Sessions (API-cost / load abuse vector).
  // No geoblocking here on purpose — a payment link must stay reachable for a
  // legitimate customer paying from anywhere.
  const rate = consumeRateLimit({
    key: `pay:${getRequestIpFromHeaders(request.headers)}`,
    limit: 10,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many payment attempts. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  // Accept either form submissions (from the pay page) or JSON clients.
  let token: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    token = typeof body?.token === "string" ? body.token : null;
  } else {
    const form = await request.formData().catch(() => null);
    const value = form?.get("token");
    token = typeof value === "string" ? value : null;
  }

  if (!token) {
    return NextResponse.json({ error: "Missing payment token." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { payToken: token },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      isDeleted: true,
      documentType: true,
      currency: true,
      totalCents: true,
    },
  });

  // Generic 404 for any non-payable state so the endpoint does not reveal
  // whether a token maps to a paid/void/draft invoice.
  if (!invoice || !isInvoicePayable(invoice)) {
    return NextResponse.json(
      { error: "This invoice is not available for payment." },
      { status: 404 },
    );
  }

  try {
    const session = await createInvoiceCheckoutSession(invoice, getPublicSiteUrl());
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    // 303 so the browser issues a GET to the Stripe-hosted URL after the POST.
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    logError("invoice.stripe_checkout_failed", error, { invoiceId: invoice.id });
    return NextResponse.json(
      { error: "Unable to start payment. Please try again later." },
      { status: 502 },
    );
  }
}
