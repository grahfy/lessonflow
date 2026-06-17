import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import zlib from "node:zlib";

import { prisma } from "@/lib/db";
import { ensurePayToken } from "@/lib/invoices/pay-token";
import { isInvoicePayable } from "@/lib/invoices/payable";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerInvoiceTemplate, customerInvoiceReminderTemplate } from "@/lib/email/templates";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import type { InvoiceTemplateRecord } from "@/lib/invoices/template";

/**
 * DB-backed + render integration tests for the Stripe payments path.
 *
 * These complement the mocked unit suites (stripe-webhook / stripe-checkout /
 * invoice-pay-token), which already pin the in-memory contracts. Here we exercise
 * the real seams those mocks stand in for:
 *  - the webhook handler against a REAL signed event and REAL Invoice/audit rows;
 *  - ensurePayToken persisting a unique token to the real DB and being idempotent;
 *  - the public pay route's payable-state gate over real rows (Stripe checkout
 *    mocked so no network is hit);
 *  - the email templates and the rendered PDF actually showing/hiding the pay link.
 *
 * No network is touched: the webhook signature is verified offline via
 * generateTestHeaderString, and the only Stripe API call (checkout.sessions.create)
 * is mocked at the createInvoiceCheckoutSession seam.
 */

// Mock ONLY the checkout seam (network call). The webhook test deliberately uses
// the REAL @/lib/stripe/client so it can verify a genuine signature; the webhook
// route never imports checkout.ts, so this mock does not affect it.
const { mockCreateCheckoutSession } = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/stripe/checkout", () => ({
  createInvoiceCheckoutSession: mockCreateCheckoutSession,
}));

const WEBHOOK_SECRET = "whsec_test_integration";
const STRIPE_KEY = "sk_test_integration";

// A standalone Stripe client used only to SIGN test payloads (no network).
const signingStripe = new Stripe(STRIPE_KEY, { apiVersion: "2026-05-27.dahlia" });

// Imported lazily after env is stubbed so module-level config reads see the keys.
let stripeWebhook: (request: NextRequest) => Promise<Response>;
let payRoute: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  // isStripeConfigured() reads STRIPE_SECRET_KEY at call time, so set it before
  // importing the routes is not strictly required, but keep it set throughout.
  process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  ({ POST: stripeWebhook } = await import("@/app/api/webhooks/stripe/route"));
  ({ POST: payRoute } = await import("@/app/api/public/invoices/pay/route"));
});

afterAll(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

let invoiceSeq = 0;

/**
 * Inserts a fully-formed Invoice row in the real test DB. Defaults describe a
 * payable ("sent") $99.00 AUD invoice; override any field per test.
 */
async function createInvoiceRow(overrides: Partial<Record<string, unknown>> = {}) {
  invoiceSeq += 1;
  const issuedAt = new Date("2026-06-01T00:00:00.000Z");
  return prisma.invoice.create({
    data: {
      invoiceNumber: `MGS-PAYTEST-${Date.now()}-${invoiceSeq}`,
      status: "sent",
      taxMode: "taxable",
      currency: "AUD",
      customerName: "Pat Payer",
      customerEmail: "pat@example.com",
      customerPhone: "0400000000",
      customerAddress: "1 Test Street, Northcote VIC 3070",
      sellerBusinessName: "Melbourne Guitar School",
      sellerAbn: "12345678901",
      sellerEmail: "no-reply@example.com",
      bankName: "ANZ",
      bankBsb: "013001",
      bankAccountName: "Melbourne Guitar School",
      bankAccountNumber: "12345678",
      subtotalCents: 9000,
      gstCents: 900,
      totalCents: 9900,
      issuedAt,
      dueAt: new Date("2026-06-15T00:00:00.000Z"),
      ...(overrides as Record<string, never>),
    },
  });
}

/** Removes audit logs + invoices created by this suite. */
async function cleanupInvoices() {
  await prisma.invoiceAuditLog.deleteMany({
    where: { invoice: { invoiceNumber: { startsWith: "MGS-PAYTEST-" } } },
  });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: "MGS-PAYTEST-" } } });
}

function checkoutCompletedPayload(invoiceId: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: `evt_${invoiceId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_integration_1",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 9900,
        currency: "aud",
        payment_intent: "pi_test_integration_1",
        metadata: { invoiceId },
        ...overrides,
      },
    },
  });
}

/** Builds a NextRequest carrying a genuinely-signed webhook payload. */
function signedWebhookRequest(payload: string) {
  const signature = signingStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new NextRequest("https://example.com/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/json", "stripe-signature": signature },
  });
}

describe("payments integration: webhook end-to-end (real signature + real DB)", () => {
  beforeEach(async () => {
    await cleanupInvoices();
  });
  afterEach(async () => {
    await cleanupInvoices();
  });

  it("marks a sent invoice paid with a genuinely-signed event", async () => {
    const invoice = await createInvoiceRow();
    const res = await stripeWebhook(signedWebhookRequest(checkoutCompletedPayload(invoice.id)));
    expect(res.status).toBe(200);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("paid");
    expect(updated?.paidVia).toBe("stripe");
    expect(updated?.paidAt).toBeInstanceOf(Date);
    expect(updated?.stripePaymentIntentId).toBe("pi_test_integration_1");
    expect(updated?.stripeCheckoutSessionId).toBe("cs_test_integration_1");

    const audits = await prisma.invoiceAuditLog.findMany({
      where: { invoiceId: invoice.id, action: "marked_paid" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].details).toMatch(/stripe/i);
  });

  it("is idempotent across a duplicate delivery (single paid, single audit)", async () => {
    const invoice = await createInvoiceRow();
    const payload = checkoutCompletedPayload(invoice.id);

    await stripeWebhook(signedWebhookRequest(payload));
    const second = await stripeWebhook(signedWebhookRequest(payload));
    expect(second.status).toBe(200);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("paid");

    const audits = await prisma.invoiceAuditLog.findMany({
      where: { invoiceId: invoice.id, action: "marked_paid" },
    });
    expect(audits).toHaveLength(1);
  });

  it("leaves the invoice 'sent' when the amount does not match", async () => {
    const invoice = await createInvoiceRow();
    const res = await stripeWebhook(
      signedWebhookRequest(checkoutCompletedPayload(invoice.id, { amount_total: 100 })),
    );
    expect(res.status).toBe(200);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("sent");
    expect(updated?.paidAt).toBeNull();
    const audits = await prisma.invoiceAuditLog.findMany({ where: { invoiceId: invoice.id } });
    expect(audits).toHaveLength(0);
  });

  it("leaves the invoice 'sent' when the currency does not match", async () => {
    const invoice = await createInvoiceRow();
    const res = await stripeWebhook(
      signedWebhookRequest(checkoutCompletedPayload(invoice.id, { currency: "usd" })),
    );
    expect(res.status).toBe(200);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("sent");
    expect(updated?.paidAt).toBeNull();
  });

  it("rejects a tampered/invalid signature with 400 and no DB change", async () => {
    const invoice = await createInvoiceRow();
    const payload = checkoutCompletedPayload(invoice.id);
    // Sign a DIFFERENT payload so the signature does not match the body sent.
    const badSignature = signingStripe.webhooks.generateTestHeaderString({
      payload: checkoutCompletedPayload(invoice.id, { amount_total: 1 }),
      secret: WEBHOOK_SECRET,
    });
    const req = new NextRequest("https://example.com/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json", "stripe-signature": badSignature },
    });

    const res = await stripeWebhook(req);
    expect(res.status).toBe(400);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("sent");
  });

  it("rejects a request with no signature header with 400", async () => {
    const invoice = await createInvoiceRow();
    const req = new NextRequest("https://example.com/api/webhooks/stripe", {
      method: "POST",
      body: checkoutCompletedPayload(invoice.id),
      headers: { "content-type": "application/json" },
    });
    const res = await stripeWebhook(req);
    expect(res.status).toBe(400);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("sent");
  });

  it("returns 500 when a DB write throws mid-handler so Stripe retries", async () => {
    const invoice = await createInvoiceRow();
    // Force the post-update audit write to fail; the route's catch should surface
    // a 500 (not a 200) so Stripe redelivers. The handler is idempotent, so the
    // retry is safe even though the invoice row was already transitioned to paid.
    const spy = vi
      .spyOn(prisma.invoiceAuditLog, "create")
      .mockRejectedValueOnce(new Error("simulated DB failure"));

    try {
      const res = await stripeWebhook(signedWebhookRequest(checkoutCompletedPayload(invoice.id)));
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("payments integration: ensurePayToken against real DB", () => {
  beforeEach(async () => {
    await cleanupInvoices();
  });
  afterEach(async () => {
    await cleanupInvoices();
  });

  it("persists a unique token and is idempotent on repeat calls", async () => {
    const invoice = await createInvoiceRow({ payToken: null });

    const first = await ensurePayToken({ id: invoice.id, payToken: null });
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);

    const afterFirst = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(afterFirst?.payToken).toBe(first);

    // Idempotent: passing the now-existing token returns it and does not rotate.
    const second = await ensurePayToken({ id: invoice.id, payToken: first });
    expect(second).toBe(first);

    const afterSecond = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(afterSecond?.payToken).toBe(first);
  });

  it("issues distinct tokens for distinct invoices (DB @unique holds)", async () => {
    const a = await createInvoiceRow({ payToken: null });
    const b = await createInvoiceRow({ payToken: null });
    const tokenA = await ensurePayToken({ id: a.id, payToken: null });
    const tokenB = await ensurePayToken({ id: b.id, payToken: null });
    expect(tokenA).not.toBe(tokenB);
  });
});

describe("payments integration: public pay route gating (real DB, mocked checkout)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateCheckoutSession.mockResolvedValue({
      id: "cs_test_route",
      url: "https://stripe.test/cs_test_route",
    });
    await cleanupInvoices();
  });
  afterEach(async () => {
    await cleanupInvoices();
  });

  function payRequest(token: string) {
    return new NextRequest("https://example.com/api/public/invoices/pay", {
      method: "POST",
      body: JSON.stringify({ token }),
      headers: { "content-type": "application/json" },
    });
  }

  it("redirects (303) to the Stripe URL for a sent invoice", async () => {
    const invoice = await createInvoiceRow({ status: "sent", payToken: "tok-route-sent" });
    const res = await payRoute(payRequest("tok-route-sent"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://stripe.test/cs_test_route");
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    // The route must charge from the server-side invoice record.
    expect(mockCreateCheckoutSession.mock.calls[0][0]).toMatchObject({ id: invoice.id });
  });

  it.each(["draft", "paid", "void"])(
    "returns a generic 404 (no checkout) for a %s invoice",
    async (status) => {
      await createInvoiceRow({ status, payToken: `tok-route-${status}` });
      const res = await payRoute(payRequest(`tok-route-${status}`));
      expect(res.status).toBe(404);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for a deleted (soft-deleted) sent invoice", async () => {
    await createInvoiceRow({ status: "sent", isDeleted: true, payToken: "tok-route-deleted" });
    const res = await payRoute(payRequest("tok-route-deleted"));
    expect(res.status).toBe(404);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 404 for a sent credit note (documentType !== invoice)", async () => {
    // A credit note is never payable online even when "sent": isInvoicePayable
    // gates on documentType === "invoice", and the route relies on that helper.
    await createInvoiceRow({
      status: "sent",
      documentType: "credit_note",
      payToken: "tok-route-creditnote",
    });
    const res = await payRoute(payRequest("tok-route-creditnote"));
    expect(res.status).toBe(404);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown token", async () => {
    const res = await payRoute(payRequest("tok-does-not-exist"));
    expect(res.status).toBe(404);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
});

describe("payments integration: isInvoicePayable shared rule", () => {
  // Exercises the REAL helper (not a local copy) so the pay route, pay page, and
  // email/PDF gating all share one definition that cannot drift.
  it("treats a sent, non-deleted invoice document as payable", () => {
    expect(isInvoicePayable({ status: "sent", isDeleted: false, documentType: "invoice" })).toBe(true);
  });

  it.each(["draft", "paid", "void"])("rejects a %s invoice", (status) => {
    expect(isInvoicePayable({ status, isDeleted: false, documentType: "invoice" })).toBe(false);
  });

  it("rejects a deleted invoice even when sent", () => {
    expect(isInvoicePayable({ status: "sent", isDeleted: true, documentType: "invoice" })).toBe(false);
  });

  it("rejects a sent credit note (documentType !== invoice)", () => {
    expect(isInvoicePayable({ status: "sent", isDeleted: false, documentType: "credit_note" })).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isInvoicePayable(null)).toBe(false);
    expect(isInvoicePayable(undefined)).toBe(false);
  });
});

describe("payments integration: pay-route per-IP rate limiter", () => {
  // The pay route calls consumeRateLimit({ key: `pay:${ip}`, limit: 10, windowMs: 60_000 }).
  // consumeRateLimit auto-bypasses while VITEST is set, so we cannot drive a 429
  // through the route in this suite (per design). Instead we pin the limiter
  // contract the route depends on by exercising consumeRateLimit directly with
  // the VITEST bypass temporarily lifted.
  const originalVitest = process.env.VITEST;
  const originalDisabled = process.env.RATE_LIMIT_DISABLED;

  beforeEach(() => {
    delete process.env.VITEST;
    delete process.env.RATE_LIMIT_DISABLED;
  });
  afterEach(() => {
    if (originalVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
    if (originalDisabled === undefined) delete process.env.RATE_LIMIT_DISABLED;
    else process.env.RATE_LIMIT_DISABLED = originalDisabled;
  });

  it("allows 10 attempts then returns 429 with a Retry-After for the 11th", () => {
    const key = `pay:test-ip-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 10; i += 1) {
      const result = consumeRateLimit({ key, limit: 10, windowMs: 60 * 1000 });
      expect(result.allowed).toBe(true);
    }
    const blocked = consumeRateLimit({ key, limit: 10, windowMs: 60 * 1000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("payments integration: manual mark_paid sets paidVia=manual", () => {
  // Contrasts with the webhook path (paidVia="stripe"): the admin mark_paid route
  // records paidVia="manual" + a marked_paid audit. Driven end-to-end through the
  // real PATCH route with an owner-admin session.
  beforeEach(async () => {
    await cleanupInvoices();
  });
  afterEach(async () => {
    await cleanupInvoices();
  });

  it("transitions a sent invoice to paid with paidVia='manual' and an audit row", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await createInvoiceRow({ status: "sent" });

    const { PATCH } = await import("@/app/api/admin/invoices/[id]/route");
    const req = new NextRequest(`https://example.com/api/admin/invoices/${invoice.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_paid" }),
      headers: {
        "content-type": "application/json",
        cookie: `${getSessionCookieName()}=${token}`,
      },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: invoice.id }) });
    expect(res.status).toBe(200);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("paid");
    expect(updated?.paidVia).toBe("manual");
    expect(updated?.paidAt).toBeInstanceOf(Date);

    const audits = await prisma.invoiceAuditLog.findMany({
      where: { invoiceId: invoice.id, action: "marked_paid" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].details).not.toMatch(/stripe/i);
  });
});

describe("payments integration: email template pay link", () => {
  it("customerInvoiceTemplate includes the Pay online link when payUrl is set", () => {
    const { html } = customerInvoiceTemplate({
      invoiceNumber: "MGS-2026-0001",
      customerName: "Pat Payer",
      dueAt: new Date("2026-06-15T00:00:00.000Z"),
      totalCents: 9900,
      sellerBusinessName: "Melbourne Guitar School",
      payUrl: "https://example.com/pay/abc123",
    });
    expect(html).toContain("Pay online");
    expect(html).toContain("https://example.com/pay/abc123");
  });

  it("customerInvoiceTemplate omits the Pay online link when payUrl is absent", () => {
    const { html } = customerInvoiceTemplate({
      invoiceNumber: "MGS-2026-0001",
      customerName: "Pat Payer",
      dueAt: new Date("2026-06-15T00:00:00.000Z"),
      totalCents: 9900,
      sellerBusinessName: "Melbourne Guitar School",
    });
    expect(html).not.toContain("Pay online");
  });

  it("reminder template returns a rendered string (no thrown TypeError) with a payUrl", () => {
    // Regression guard: the reminder must render its pay-online anchor without
    // throwing when handed a payUrl (the review-flagged gap).
    let result: { subject: string; html: string } | undefined;
    expect(() => {
      result = customerInvoiceReminderTemplate({
        invoiceNumber: "MGS-2026-0002",
        customerName: "Pat Payer",
        dueAt: new Date("2026-06-15T00:00:00.000Z"),
        totalCents: 9900,
        sellerBusinessName: "Melbourne Guitar School",
        overdueDays: 5,
        payUrl: "https://example.com/pay/reminder-token",
      });
    }).not.toThrow();
    expect(typeof result?.html).toBe("string");
  });

  it("reminder template includes the Pay online link when payUrl is set and omits it otherwise", () => {
    const withLink = customerInvoiceReminderTemplate({
      invoiceNumber: "MGS-2026-0002",
      customerName: "Pat Payer",
      dueAt: new Date("2026-06-15T00:00:00.000Z"),
      totalCents: 9900,
      sellerBusinessName: "Melbourne Guitar School",
      overdueDays: 5,
      payUrl: "https://example.com/pay/reminder-token",
    });
    expect(withLink.html).toContain("Pay online");
    expect(withLink.html).toContain("https://example.com/pay/reminder-token");
    // The anchor must be a real href, not just stray text.
    expect(withLink.html).toContain('href="https://example.com/pay/reminder-token"');

    const withoutLink = customerInvoiceReminderTemplate({
      invoiceNumber: "MGS-2026-0002",
      customerName: "Pat Payer",
      dueAt: new Date("2026-06-15T00:00:00.000Z"),
      totalCents: 9900,
      sellerBusinessName: "Melbourne Guitar School",
      overdueDays: 5,
    });
    expect(withoutLink.html).not.toContain("Pay online");
  });
});

/**
 * Extracts visible text drawn by pdf-lib. pdf-lib FlateDecodes its content
 * streams and writes drawn strings as hex `<...> Tj` operators, so we inflate
 * every stream and decode any hex string literals back to text.
 */
function extractPdfText(pdf: Buffer): string {
  const out: string[] = [];
  const streamTok = Buffer.from("stream");
  const endTok = Buffer.from("endstream");
  let idx = 0;
  while (true) {
    const start = pdf.indexOf(streamTok, idx);
    if (start === -1) break;
    let dataStart = start + streamTok.length;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    const end = pdf.indexOf(endTok, dataStart);
    if (end === -1) break;
    let dataEnd = end;
    if (pdf[dataEnd - 1] === 0x0a) dataEnd--;
    if (pdf[dataEnd - 1] === 0x0d) dataEnd--;
    const chunk = pdf.subarray(dataStart, dataEnd);
    idx = end + endTok.length;
    let inflated: string;
    try {
      inflated = zlib.inflateSync(chunk).toString("latin1");
    } catch {
      continue; // not a flate stream (fonts, etc.)
    }
    // pdf-lib renders text as hex string literals inside Tj (single string) or
    // TJ (array of strings + kerning numbers) operators. A single drawText can be
    // split across several fragments, so decode EVERY hex literal in document
    // order and concatenate with no separator to faithfully reconstruct the line.
    for (const hex of inflated.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const value = hex[1];
      if (value.length % 2 !== 0) continue;
      out.push(Buffer.from(value, "hex").toString("latin1"));
    }
  }
  // No separator: contiguous fragments of one drawn line (e.g. "Pay online" + ": "
  // + url) rejoin into the original string. Distinct lines do bleed together, but
  // the assertions search for unambiguous substrings so that is harmless.
  return out.join("");
}

function pdfInvoiceRecord(overrides: Partial<InvoiceTemplateRecord> = {}): InvoiceTemplateRecord {
  const base: InvoiceTemplateRecord = {
    id: "inv_pdf_1",
    invoiceNumber: "MGS-2026-0009",
    status: "sent",
    documentType: "invoice",
    taxMode: "taxable",
    discountKind: null,
    discountValue: null,
    discountCents: 0,
    paymentDetailsSource: "custom",
    currency: "AUD",
    customerId: null,
    bookingId: null,
    originalInvoiceId: null,
    customerFirstName: "Pat",
    customerLastName: "Payer",
    customerName: "Pat Payer",
    customerEmail: "pat@example.com",
    customerPhone: "0400000000",
    customerAddress: "1 Test Street, Northcote VIC 3070",
    sellerBusinessName: "Melbourne Guitar School",
    sellerAbn: "12345678901",
    sellerEmail: "owner@example.com",
    bankName: "ANZ",
    bankBsb: "013001",
    bankAccountName: "Melbourne Guitar School",
    bankAccountNumber: "12345678",
    subtotalCents: 9000,
    gstCents: 900,
    totalCents: 9900,
    notes: null,
    issuedAt: new Date("2026-06-01T00:00:00.000Z"),
    dueAt: new Date("2026-06-15T00:00:00.000Z"),
    sentAt: new Date("2026-06-01T00:00:00.000Z"),
    paidAt: null,
    paidVia: null,
    payToken: "pdf-pay-token",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    lastReminderSentAt: null,
    lastReminderStage: null,
    isDeleted: false,
    createdById: null,
    updatedById: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    lineItems: [
      {
        id: "line_pdf_1",
        invoiceId: "inv_pdf_1",
        kind: "lesson_fee",
        description: "Lesson fee",
        quantity: 1,
        unitPriceCents: 9000,
        taxMode: "taxable",
        discountKind: null,
        discountValue: null,
        lineDiscountCents: 0,
        lineSubtotalCents: 9000,
        lineGstCents: 900,
        lineTotalCents: 9900,
        sortOrder: 0,
        packageId: null,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ],
  };
  return { ...base, ...overrides };
}

describe("payments integration: PDF pay link rendering", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
  });

  it("renders the Pay online line when Stripe is configured, invoice is sent, and a token exists", async () => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    const pdf = await renderInvoicePdf(pdfInvoiceRecord());
    const text = extractPdfText(pdf);
    expect(text).toContain("Pay online");
  });

  it("omits the Pay online line when Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const pdf = await renderInvoicePdf(pdfInvoiceRecord());
    const text = extractPdfText(pdf);
    expect(text).not.toContain("Pay online");
  });

  it("omits the Pay online line when the invoice is not in a payable state", async () => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    const pdf = await renderInvoicePdf(pdfInvoiceRecord({ status: "paid" }));
    const text = extractPdfText(pdf);
    expect(text).not.toContain("Pay online");
  });

  it("omits the Pay online line when the invoice has no pay token", async () => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    const pdf = await renderInvoicePdf(pdfInvoiceRecord({ payToken: null }));
    const text = extractPdfText(pdf);
    expect(text).not.toContain("Pay online");
  });
});
