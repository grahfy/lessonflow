import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the args passed to Stripe's checkout.sessions.create so we can assert
// the exact amount/currency/metadata/idempotency mapping without touching Stripe.
// vi.hoisted keeps these initialized before the hoisted vi.mock factories run.
const { mockSessionsCreate, mockInvoiceUpdate } = vi.hoisted(() => ({
  mockSessionsCreate: vi.fn(),
  mockInvoiceUpdate: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: mockSessionsCreate,
      },
    },
  }),
  isStripeConfigured: () => true,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      update: mockInvoiceUpdate,
    },
  },
}));

import { createInvoiceCheckoutSession } from "@/lib/stripe/checkout";

const baseInvoice = {
  id: "inv_123",
  invoiceNumber: "MGS-2026-0001",
  currency: "AUD",
  totalCents: 9900,
};

describe("createInvoiceCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionsCreate.mockResolvedValue({ id: "cs_test_123", url: "https://stripe.test/cs_test_123" });
    mockInvoiceUpdate.mockResolvedValue(undefined);
  });

  it("charges exactly invoice.totalCents with quantity 1", async () => {
    await createInvoiceCheckoutSession(baseInvoice, "https://example.com");

    const [params] = mockSessionsCreate.mock.calls[0];
    expect(params.mode).toBe("payment");
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0].quantity).toBe(1);
    expect(params.line_items[0].price_data.unit_amount).toBe(9900);
    expect(params.line_items[0].price_data.product_data.name).toBe("Invoice MGS-2026-0001");
  });

  it("lowercases the currency", async () => {
    await createInvoiceCheckoutSession({ ...baseInvoice, currency: "USD" }, "https://example.com");

    const [params] = mockSessionsCreate.mock.calls[0];
    expect(params.line_items[0].price_data.currency).toBe("usd");
  });

  it("sets metadata.invoiceId", async () => {
    await createInvoiceCheckoutSession(baseInvoice, "https://example.com");

    const [params] = mockSessionsCreate.mock.calls[0];
    expect(params.metadata.invoiceId).toBe("inv_123");
  });

  it("derives the idempotency key from invoiceId and totalCents", async () => {
    await createInvoiceCheckoutSession(baseInvoice, "https://example.com");

    const [, options] = mockSessionsCreate.mock.calls[0];
    expect(options.idempotencyKey).toBe("invoice-checkout-inv_123-9900");
  });

  it("uses a different idempotency key when the total changes", async () => {
    await createInvoiceCheckoutSession(baseInvoice, "https://example.com");
    await createInvoiceCheckoutSession({ ...baseInvoice, totalCents: 12000 }, "https://example.com");

    const firstKey = mockSessionsCreate.mock.calls[0][1].idempotencyKey;
    const secondKey = mockSessionsCreate.mock.calls[1][1].idempotencyKey;
    expect(firstKey).not.toBe(secondKey);
  });

  it("builds success and cancel URLs from the base URL without a double slash", async () => {
    await createInvoiceCheckoutSession(baseInvoice, "https://example.com/");

    const [params] = mockSessionsCreate.mock.calls[0];
    expect(params.success_url.startsWith("https://example.com/pay/success")).toBe(true);
    expect(params.cancel_url.startsWith("https://example.com/pay/cancelled")).toBe(true);
  });

  it("persists the checkout session id on the invoice", async () => {
    await createInvoiceCheckoutSession(baseInvoice, "https://example.com");

    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv_123" },
      data: { stripeCheckoutSessionId: "cs_test_123" },
    });
  });
});
