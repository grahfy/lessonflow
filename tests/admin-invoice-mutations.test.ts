import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as createCreditNote } from "@/app/api/admin/invoices/[id]/credit-note/route";
import { GET as getInvoice } from "@/app/api/admin/invoices/[id]/route";
import { DELETE, PATCH } from "@/app/api/admin/invoices/[id]/route";
import { GET as getInvoicePdf } from "@/app/api/admin/invoices/[id]/pdf/route";
import { POST as sendInvoice } from "@/app/api/admin/invoices/[id]/send/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as invoiceEvents from "@/lib/invoice-events";
import { renderInvoiceHtml } from "@/lib/invoices/template";

function adminRequest(url: string, method: "POST" | "PATCH" | "DELETE" | "GET", token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

async function seedInvoice(adminId: string, invoiceNumber: string) {
  return prisma.invoice.create({
    data: {
      invoiceNumber,
      status: "draft",
      taxMode: "taxable",
      customerFirstName: "Alex",
      customerLastName: "Student",
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
      subtotalCents: 9000,
      gstCents: 900,
      totalCents: 9900,
      issuedAt: new Date("2026-07-01T00:00:00.000Z"),
      dueAt: new Date("2026-07-15T00:00:00.000Z"),
      createdById: adminId,
      updatedById: adminId,
      lineItems: {
        create: {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 9000,
          taxMode: "taxable",
          lineSubtotalCents: 9000,
          lineGstCents: 900,
          lineTotalCents: 9900,
          sortOrder: 0
        }
      }
    },
    include: {
      lineItems: true
    }
  });
}

describe("admin-invoice-mutations", () => {
  beforeEach(async () => {
    await prisma.invoiceAuditLog.deleteMany();
    await prisma.invoiceLineItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.outboundEmail.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends invoice email and records outbound email row", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9999");

    const req = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/send`, "POST", token);
    const res = await sendInvoice(req, { params: Promise.resolve({ id: invoice.id }) });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      ok: boolean;
      partial?: boolean;
      warning?: string;
      deliveryStatus?: string;
      invoice: { status: string; sentAt: string | null };
    };
    expect(body.ok).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.warning).toContain("no live email provider");
    expect(body.deliveryStatus).toBe("queued_no_smtp");
    expect(body.invoice.status).toBe("sent");
    expect(body.invoice.sentAt).toBeTruthy();

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reloaded.status).toBe("sent");
    expect(reloaded.sentAt).not.toBeNull();

    const outbound = await prisma.outboundEmail.findFirstOrThrow({
      where: {
        toEmail: "alex@example.com"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(outbound.subject).toContain("MGS-2026-9999");
    expect(outbound.status).toBe("queued_no_smtp");
    expect(outbound.htmlBody).toContain("Alex Student");
  });

  it("returns partial success when invoice state persists but delivery fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9912");

    vi.spyOn(invoiceEvents, "sendCustomerInvoiceEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const req = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/send`, "POST", token);
    const res = await sendInvoice(req, { params: Promise.resolve({ id: invoice.id }) });

    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      ok?: boolean;
      partial?: boolean;
      warning?: string;
      invoice?: { status: string; sentAt: string | null };
    };
    expect(body.ok).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.warning).toContain("could not be delivered");
    expect(body.invoice?.status).toBe("sent");
    expect(body.invoice?.sentAt).toBeTruthy();

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reloaded.status).toBe("sent");
    expect(reloaded.sentAt).not.toBeNull();
  });

  it("supports pdf, protects paid delete, and creates credit notes", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const draftInvoice = await seedInvoice(admin.id, "MGS-2026-9998");

    const draftDeleteReq = adminRequest(`http://localhost/api/admin/invoices/${draftInvoice.id}`, "DELETE", token);
    const draftDeleteRes = await DELETE(draftDeleteReq, { params: Promise.resolve({ id: draftInvoice.id }) });
    expect(draftDeleteRes.status).toBe(200);

    const invoice = await seedInvoice(admin.id, "MGS-2026-9997");

    const pdfReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/pdf`, "GET", token);
    const pdfRes = await getInvoicePdf(pdfReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toContain("application/pdf");
    const pdfBuffer = await pdfRes.arrayBuffer();
    expect(pdfBuffer.byteLength).toBeGreaterThan(0);

    const sendReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/send`, "POST", token);
    const sendRes = await sendInvoice(sendReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(sendRes.status).toBe(202);

    const markPaidReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "PATCH", token, {
      action: "mark_paid"
    });
    const markPaidRes = await PATCH(markPaidReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(markPaidRes.status).toBe(200);

    const deleteReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "DELETE", token);
    const deleteRes = await DELETE(deleteReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(deleteRes.status).toBe(400);

    const creditReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/credit-note`, "POST", token, {
      reason: "Duplicate charge"
    });
    const creditRes = await createCreditNote(creditReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(creditRes.status).toBe(201);
    const creditBody = (await creditRes.json()) as { invoice: { documentType: string; totalCents: number; originalInvoiceId: string | null } };

    expect(creditBody.invoice.documentType).toBe("credit_note");
    expect(creditBody.invoice.totalCents).toBeLessThan(0);
    expect(creditBody.invoice.originalInvoiceId).toBe(invoice.id);
  });

  it("saves added lesson fee line items during invoice edit", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9913");

    const editReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "PATCH", token, {
      action: "edit",
      lineItems: [
        {
          id: invoice.lineItems[0].id,
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 9000,
          taxMode: "taxable",
          sortOrder: 0
        },
        {
          kind: "lesson_fee",
          description: "1 x 60 minute lesson",
          quantity: 1,
          unitPriceCents: 12000,
          taxMode: "taxable",
          sortOrder: 1
        }
      ]
    });
    const editRes = await PATCH(editReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(editRes.status).toBe(200);

    const body = (await editRes.json()) as {
      invoice: {
        subtotalCents: number;
        gstCents: number;
        totalCents: number;
        lineItems: Array<{ kind: string; description: string; unitPriceCents: number }>;
      };
    };
    expect(body.invoice.subtotalCents).toBe(21000);
    expect(body.invoice.gstCents).toBe(2100);
    expect(body.invoice.totalCents).toBe(23100);
    expect(body.invoice.lineItems).toHaveLength(2);
    expect(body.invoice.lineItems[1]).toMatchObject({
      kind: "lesson_fee",
      description: "1 x 60 minute lesson",
      unitPriceCents: 12000
    });

    const reloaded = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });
    expect(reloaded.lineItems).toHaveLength(2);
    expect(reloaded.lineItems[1]).toMatchObject({
      kind: "lesson_fee",
      description: "1 x 60 minute lesson",
      unitPriceCents: 12000
    });
  });

  it("persists invoice notes longer than the legacy varchar limit", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9916");
    const longNotes = "Invoice covers multiple lesson topics and follow-up practice tasks. ".repeat(6).trim();

    const editReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "PATCH", token, {
      action: "edit",
      notes: longNotes
    });
    const editRes = await PATCH(editReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(editRes.status).toBe(200);

    const body = (await editRes.json()) as {
      invoice: {
        notes: string | null;
      };
    };
    expect(body.invoice.notes).toBe(longNotes);
    expect(longNotes.length).toBeGreaterThan(191);

    const reloaded = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id }
    });
    expect(reloaded.notes).toBe(longNotes);
  });

  it("uses current system payment details for system-managed invoices", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9914");

    vi.stubEnv("INVOICE_BANK_NAME", "Westpac");
    vi.stubEnv("INVOICE_BANK_BSB", "033-123");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NAME", "Melbourne Guitar School System");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NUMBER", "99990000");

    const getReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "GET", token);
    const getRes = await getInvoice(getReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(getRes.status).toBe(200);

    const body = (await getRes.json()) as {
      invoice: {
        paymentDetailsSource: string;
        bankName: string;
        bankBsb: string;
        bankAccountName: string;
        bankAccountNumber: string;
      };
    };
    expect(body.invoice).toMatchObject({
      paymentDetailsSource: "system",
      bankName: "Westpac",
      bankBsb: "033-123",
      bankAccountName: "Melbourne Guitar School System",
      bankAccountNumber: "99990000"
    });

    const pdfReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/pdf`, "GET", token);
    const pdfRes = await getInvoicePdf(pdfReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toContain("application/pdf");

    const reloaded = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { lineItems: true }
    });
    expect(reloaded).toMatchObject({
      paymentDetailsSource: "system",
      bankName: "ANZ",
      bankBsb: "013001",
      bankAccountName: "Melbourne Guitar School",
      bankAccountNumber: "12345678"
    });

    const html = renderInvoiceHtml(reloaded);
    expect(html).toContain("Bank: Westpac");
    expect(html).toContain("BSB: 033-123");
    expect(html).toContain("Account Name: Melbourne Guitar School System");
    expect(html).toContain("Account Number: 99990000");
  });

  it("preserves custom payment details when an invoice opts out of system sync", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9915");

    const editReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "PATCH", token, {
      action: "edit",
      paymentDetailsSource: "custom",
      bankName: "Commonwealth Bank",
      bankBsb: "063-162",
      bankAccountName: "Melbourne Guitar School Pty Ltd",
      bankAccountNumber: "87654321"
    });
    const editRes = await PATCH(editReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(editRes.status).toBe(200);

    vi.stubEnv("INVOICE_BANK_NAME", "System Bank");
    vi.stubEnv("INVOICE_BANK_BSB", "000-111");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NAME", "System Account");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NUMBER", "11112222");

    const getReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "GET", token);
    const getRes = await getInvoice(getReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(getRes.status).toBe(200);

    const body = (await getRes.json()) as {
      invoice: {
        paymentDetailsSource: string;
        bankName: string;
        bankBsb: string;
        bankAccountName: string;
        bankAccountNumber: string;
      };
    };
    expect(body.invoice).toMatchObject({
      paymentDetailsSource: "custom",
      bankName: "Commonwealth Bank",
      bankBsb: "063-162",
      bankAccountName: "Melbourne Guitar School Pty Ltd",
      bankAccountNumber: "87654321"
    });

    const reloaded = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { lineItems: true }
    });
    expect(reloaded).toMatchObject({
      paymentDetailsSource: "custom",
      bankName: "Commonwealth Bank",
      bankBsb: "063-162",
      bankAccountName: "Melbourne Guitar School Pty Ltd",
      bankAccountNumber: "87654321"
    });

    const html = renderInvoiceHtml(reloaded);
    expect(html).toContain("Bank: Commonwealth Bank");
    expect(html).not.toContain("Bank: System Bank");
  });

  it("rejects invalid invoice transitions and keeps status unchanged", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9910");

    // mark_unpaid is only valid from 'paid', so applying it to a draft is an
    // invalid transition. (mark_paid is intentionally allowed from draft as an
    // escape hatch — see src/lib/invoices/transitions.ts — so it is no longer a
    // rejection case here.)
    const markUnpaidFromDraftReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "PATCH", token, {
      action: "mark_unpaid"
    });
    const markUnpaidFromDraftRes = await PATCH(markUnpaidFromDraftReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(markUnpaidFromDraftRes.status).toBe(400);
    const markUnpaidFromDraftBody = (await markUnpaidFromDraftRes.json()) as {
      error: string;
      details: { action: string; status: string; allowedFrom: string[] };
    };
    expect(markUnpaidFromDraftBody.error).toBe("Invalid invoice transition.");
    expect(markUnpaidFromDraftBody.details.action).toBe("mark_unpaid");
    expect(markUnpaidFromDraftBody.details.status).toBe("draft");
    expect(markUnpaidFromDraftBody.details.allowedFrom).toEqual(["paid"]);

    const sendReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/send`, "POST", token);
    const sendRes = await sendInvoice(sendReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(sendRes.status).toBe(202);

    const markUnpaidFromSentReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "PATCH", token, {
      action: "mark_unpaid"
    });
    const markUnpaidFromSentRes = await PATCH(markUnpaidFromSentReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(markUnpaidFromSentRes.status).toBe(400);

    const voidFromDraftInvoice = await seedInvoice(admin.id, "MGS-2026-9911");
    const voidFromDraftReq = adminRequest(`http://localhost/api/admin/invoices/${voidFromDraftInvoice.id}`, "PATCH", token, {
      action: "void"
    });
    const voidFromDraftRes = await PATCH(voidFromDraftReq, { params: Promise.resolve({ id: voidFromDraftInvoice.id }) });
    expect(voidFromDraftRes.status).toBe(400);

    const draftReloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: voidFromDraftInvoice.id } });
    expect(draftReloaded.status).toBe("draft");
    const sentReloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(sentReloaded.status).toBe("sent");
  });
});
