import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockConstructEventAsync,
  mockInvoiceFindUnique,
  mockInvoiceUpdateMany,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockConstructEventAsync: vi.fn(),
  mockInvoiceFindUnique: vi.fn(),
  mockInvoiceUpdateMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    webhooks: {
      constructEventAsync: mockConstructEventAsync,
    },
  }),
  isStripeConfigured: () => true,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      findUnique: mockInvoiceFindUnique,
      updateMany: mockInvoiceUpdateMany,
    },
    invoiceAuditLog: {
      create: mockAuditLogCreate,
    },
  },
}));

import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";

function webhookRequest(body: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== undefined) {
    headers["stripe-signature"] = signature;
  }
  return new NextRequest("https://example.com/api/webhooks/stripe", {
    method: "POST",
    body,
    headers,
  });
}

function checkoutCompletedEvent(
  overrides: Record<string, unknown> = {},
  type = "checkout.session.completed",
) {
  return {
    id: "evt_1",
    type,
    data: {
      object: {
        id: "cs_test_1",
        amount_total: 9900,
        currency: "aud",
        payment_status: "paid",
        payment_intent: "pi_test_1",
        metadata: { invoiceId: "inv_1" },
        ...overrides,
      },
    },
  };
}

const sentInvoice = {
  id: "inv_1",
  status: "sent",
  isDeleted: false,
  currency: "AUD",
  totalCents: 9900,
};

describe("stripe webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_x");
    mockInvoiceUpdateMany.mockResolvedValue({ count: 1 });
    mockAuditLogCreate.mockResolvedValue(undefined);
  });

  it("rejects a request with no signature header (400)", async () => {
    const res = await stripeWebhook(webhookRequest("{}"));
    expect(res.status).toBe(400);
    expect(mockConstructEventAsync).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature (400)", async () => {
    mockConstructEventAsync.mockRejectedValue(new Error("No signatures found matching the expected signature"));
    const res = await stripeWebhook(webhookRequest("{}", "bad-sig"));
    expect(res.status).toBe(400);
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("marks the invoice paid once on checkout.session.completed", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent());
    mockInvoiceFindUnique.mockResolvedValue(sentInvoice);

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);

    expect(mockInvoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: "inv_1", status: "sent" },
      data: expect.objectContaining({
        status: "paid",
        paidVia: "stripe",
        stripePaymentIntentId: "pi_test_1",
        stripeCheckoutSessionId: "cs_test_1",
      }),
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: "inv_1",
        action: "marked_paid",
      }),
    });
  });

  it("is a no-op when the invoice is already paid (idempotent)", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent());
    mockInvoiceFindUnique.mockResolvedValue({ ...sentInvoice, status: "paid" });

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("does not mark paid twice across duplicate deliveries", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent());
    // First delivery: invoice is sent -> gets marked paid.
    mockInvoiceFindUnique.mockResolvedValueOnce(sentInvoice);
    // Second (duplicate) delivery: invoice now reads back as paid -> no-op.
    mockInvoiceFindUnique.mockResolvedValueOnce({ ...sentInvoice, status: "paid" });

    await stripeWebhook(webhookRequest("{}", "good-sig"));
    await stripeWebhook(webhookRequest("{}", "good-sig"));

    expect(mockInvoiceUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
  });

  it("does not record paid twice when a concurrent delivery wins the race", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent());
    mockInvoiceFindUnique.mockResolvedValue(sentInvoice);
    // Both deliveries read "sent", but the guarded updateMany affects zero rows
    // because the other delivery already transitioned it.
    mockInvoiceUpdateMany.mockResolvedValue({ count: 0 });

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("refuses to mark paid when the amount does not match", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent({ amount_total: 100 }));
    mockInvoiceFindUnique.mockResolvedValue(sentInvoice);

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("refuses to mark paid when the currency does not match", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent({ currency: "usd" }));
    mockInvoiceFindUnique.mockResolvedValue(sentInvoice);

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("does not mark paid when the session payment_status is not 'paid' (async/delayed)", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent({ payment_status: "unpaid" }));
    mockInvoiceFindUnique.mockResolvedValue(sentInvoice);

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("marks the invoice paid on checkout.session.async_payment_succeeded", async () => {
    mockConstructEventAsync.mockResolvedValue(
      checkoutCompletedEvent({}, "checkout.session.async_payment_succeeded"),
    );
    mockInvoiceFindUnique.mockResolvedValue(sentInvoice);

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: "inv_1", status: "sent" },
      data: expect.objectContaining({ status: "paid", paidVia: "stripe" }),
    });
    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
  });

  it("does not mark paid for an unknown invoice", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent());
    mockInvoiceFindUnique.mockResolvedValue(null);

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("does not mark paid when metadata.invoiceId is missing", async () => {
    mockConstructEventAsync.mockResolvedValue(checkoutCompletedEvent({ metadata: {} }));

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceFindUnique).not.toHaveBeenCalled();
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("ignores unrelated event types", async () => {
    mockConstructEventAsync.mockResolvedValue({ id: "evt_2", type: "payment_intent.created", data: { object: {} } });

    const res = await stripeWebhook(webhookRequest("{}", "good-sig"));
    expect(res.status).toBe(200);
    expect(mockInvoiceFindUnique).not.toHaveBeenCalled();
  });
});
