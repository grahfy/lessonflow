import { describe, expect, it } from "vitest";

import { renderInvoiceHtml, type InvoiceTemplateRecord } from "@/lib/invoices/template";

describe("invoice template render", () => {
  it("renders configured non-aud currency and tax labels", () => {
    process.env.INVOICE_TAX_PROFILES = JSON.stringify({
      USD: {
        locale: "en-US",
        taxLabel: "Sales Tax",
        taxRateBasisPoints: 1000,
        registered: true,
        defaultTaxMode: "taxable"
      }
    });

    const invoice: InvoiceTemplateRecord = {
      id: "inv_1",
      invoiceNumber: "MGS-2026-0001",
      status: "draft",
      documentType: "invoice",
      taxMode: "taxable",
      discountKind: null,
      discountValue: null,
      discountCents: 0,
      paymentDetailsSource: "custom",
      currency: "USD",
      customerId: null,
      bookingId: null,
      originalInvoiceId: null,
      customerFirstName: "Alex",
      customerLastName: "Student",
      customerName: "Alex Student",
      customerEmail: "alex@example.com",
      customerPhone: "0400123456",
      customerAddress: "10 Main Street, Northcote VIC 3070",
      sellerBusinessName: "Melbourne Guitar School",
      sellerAbn: "12345678901",
      sellerEmail: "owner@example.com",
      bankName: "ANZ",
      bankBsb: "013001",
      bankAccountName: "Melbourne Guitar School",
      bankAccountNumber: "12345678",
      subtotalCents: 10000,
      gstCents: 1000,
      totalCents: 11000,
      notes: null,
      issuedAt: new Date("2026-08-01T10:00:00.000Z"),
      dueAt: new Date("2026-08-15T10:00:00.000Z"),
      sentAt: null,
      paidAt: null,
      paidVia: null,
      payToken: null,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      lastReminderSentAt: null,
      lastReminderStage: null,
      isDeleted: false,
      createdById: null,
      updatedById: null,
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
      lineItems: [
        {
          id: "line_1",
          invoiceId: "inv_1",
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 10000,
          taxMode: "taxable",
          discountKind: null,
          discountValue: null,
          lineDiscountCents: 0,
          lineSubtotalCents: 10000,
          lineGstCents: 1000,
          lineTotalCents: 11000,
          sortOrder: 0,
          packageId: null,
          createdAt: new Date("2026-08-01T10:00:00.000Z"),
          updatedAt: new Date("2026-08-01T10:00:00.000Z")
        }
      ]
    };

    const html = renderInvoiceHtml(invoice);

    expect(html).toContain("Sales Tax");
    expect(html).toContain("$100.00");
    expect(html).toContain("$110.00");
  });
});
