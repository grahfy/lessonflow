import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createCreditNote } from "@/app/api/admin/invoices/[id]/credit-note/route";
import { DELETE, PATCH } from "@/app/api/admin/invoices/[id]/route";
import { GET as getInvoicePdf } from "@/app/api/admin/invoices/[id]/pdf/route";
import { POST as sendInvoice } from "@/app/api/admin/invoices/[id]/send/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

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

  it("sends invoice email and records outbound email row", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9999");

    const req = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/send`, "POST", token);
    const res = await sendInvoice(req, { params: Promise.resolve({ id: invoice.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; invoice: { status: string; sentAt: string | null } };
    expect(body.ok).toBe(true);
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
    expect(sendRes.status).toBe(200);

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

  it("rejects invalid invoice transitions and keeps status unchanged", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const invoice = await seedInvoice(admin.id, "MGS-2026-9910");

    const markPaidFromDraftReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}`, "PATCH", token, {
      action: "mark_paid"
    });
    const markPaidFromDraftRes = await PATCH(markPaidFromDraftReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(markPaidFromDraftRes.status).toBe(400);
    const markPaidFromDraftBody = (await markPaidFromDraftRes.json()) as {
      error: string;
      details: { action: string; status: string; allowedFrom: string[] };
    };
    expect(markPaidFromDraftBody.error).toBe("Invalid invoice transition.");
    expect(markPaidFromDraftBody.details.action).toBe("mark_paid");
    expect(markPaidFromDraftBody.details.status).toBe("draft");
    expect(markPaidFromDraftBody.details.allowedFrom).toEqual(["sent"]);

    const sendReq = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/send`, "POST", token);
    const sendRes = await sendInvoice(sendReq, { params: Promise.resolve({ id: invoice.id }) });
    expect(sendRes.status).toBe(200);

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
