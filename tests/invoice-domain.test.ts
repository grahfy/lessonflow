import { beforeEach, describe, expect, it } from "vitest";

import { calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { getInvoiceAgingBucket, getInvoiceOverdueDays, getReminderStage } from "@/lib/invoices/aging";
import { getDefaultInvoiceTaxMode } from "@/lib/invoices/gst-policy";
import { generateNextCreditNoteNumber, generateNextInvoiceNumber } from "@/lib/invoices/numbering";
import { prisma } from "@/lib/db";

describe("invoice-domain", () => {
  beforeEach(async () => {
    await prisma.invoiceAuditLog.deleteMany();
    await prisma.invoiceLineItem.deleteMany();
    await prisma.invoice.deleteMany();
    process.env.INVOICE_NUMBER_PREFIX = "MGS";
    process.env.INVOICE_GST_REGISTERED = "true";
    process.env.INVOICE_DEFAULT_TAX_MODE = "taxable";
  });

  it("calculates taxable and gst-free line totals in cents", () => {
    const result = calculateInvoiceTotals([
      {
        kind: "lesson_fee",
        description: "Lesson",
        quantity: 1,
        unitPriceCents: 10000,
        taxMode: "taxable",
        sortOrder: 0
      },
      {
        kind: "custom",
        description: "GST free add-on",
        quantity: 1,
        unitPriceCents: 5000,
        taxMode: "gst_free",
        sortOrder: 1
      }
    ]);

    expect(result.totals.subtotalCents).toBe(15000);
    expect(result.totals.gstCents).toBe(1000);
    expect(result.totals.totalCents).toBe(16000);
  });

  it("reads default tax mode from env", () => {
    expect(getDefaultInvoiceTaxMode()).toBe("taxable");
    process.env.INVOICE_DEFAULT_TAX_MODE = "gst_free";
    expect(getDefaultInvoiceTaxMode()).toBe("gst_free");
  });

  it("generates sequential invoice numbers", async () => {
    const issueDate = new Date("2026-07-01T00:00:00.000Z");
    const first = await generateNextInvoiceNumber(prisma, issueDate);
    expect(first).toBe("MGS-2026-0001");

    await prisma.invoice.create({
      data: {
        invoiceNumber: first,
        status: "draft",
        taxMode: "taxable",
        customerName: "Alex Student",
        customerEmail: "alex@example.com",
        customerPhone: "0400123456",
        customerAddress: "10 Main Street, Northcote VIC 3070",
        sellerBusinessName: "Melbourne Guitar School",
        sellerAbn: "12345678901",
        sellerEmail: "no-reply@example.com",
        bankName: "ANZ",
        bankBsb: "013001",
        bankAccountName: "Melbourne Guitar School",
        bankAccountNumber: "12345678",
        subtotalCents: 10000,
        gstCents: 1000,
        totalCents: 11000,
        issuedAt: issueDate,
        dueAt: new Date("2026-07-14T00:00:00.000Z"),
        lineItems: {
          create: {
            kind: "lesson_fee",
            description: "Lesson",
            quantity: 1,
            unitPriceCents: 10000,
            taxMode: "taxable",
            lineSubtotalCents: 10000,
            lineGstCents: 1000,
            lineTotalCents: 11000,
            sortOrder: 0
          }
        }
      }
    });

    const second = await generateNextInvoiceNumber(prisma, issueDate);
    expect(second).toBe("MGS-2026-0002");
  });

  it("generates sequential credit-note numbers", async () => {
    const issueDate = new Date("2026-07-01T00:00:00.000Z");
    const first = await generateNextCreditNoteNumber(prisma, issueDate);
    expect(first).toBe("MGSCN-2026-0001");
  });

  it("computes aging buckets and reminder stages", () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    const overdueDays = getInvoiceOverdueDays(new Date("2026-07-20T00:00:00.000Z"), now);
    expect(overdueDays).toBe(11);
    expect(getReminderStage(overdueDays)).toBe(7);

    const bucket = getInvoiceAgingBucket({
      dueAt: new Date("2026-06-20T00:00:00.000Z"),
      status: "sent",
      now
    });
    expect(bucket).toBe("overdue_31_plus");
  });
});
