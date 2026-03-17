import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as sendSingleReminder } from "@/app/api/admin/invoices/[id]/remind/route";
import { POST as sendBulkReminders } from "@/app/api/admin/invoices/reminders/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as invoiceEvents from "@/lib/invoice-events";

function adminRequest(url: string, method: "POST", token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

async function seedSentInvoice(input: {
  adminId: string;
  invoiceNumber: string;
  dueAt: Date;
  lastReminderStage?: number | null;
}) {
  return prisma.invoice.create({
    data: {
      invoiceNumber: input.invoiceNumber,
      status: "sent",
      taxMode: "taxable",
      customerName: "Reminder Student",
      customerEmail: "reminder.student@example.com",
      customerPhone: "0400000000",
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
      issuedAt: new Date("2026-07-01T00:00:00.000Z"),
      dueAt: input.dueAt,
      lastReminderStage: input.lastReminderStage ?? null,
      createdById: input.adminId,
      updatedById: input.adminId,
      lineItems: {
        create: {
          kind: "lesson_fee",
          description: "Lesson fee",
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
}

describe("admin-invoice-reminders", () => {
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

  it("sends due reminders in bulk using 7/14/30 stages", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const now = Date.now();
    await seedSentInvoice({
      adminId: admin.id,
      invoiceNumber: "MGS-2026-9901",
      dueAt: new Date(now - 8 * 24 * 60 * 60 * 1000)
    });
    await seedSentInvoice({
      adminId: admin.id,
      invoiceNumber: "MGS-2026-9902",
      dueAt: new Date(now - 2 * 24 * 60 * 60 * 1000)
    });

    const req = adminRequest("http://localhost/api/admin/invoices/reminders", "POST", token, {});
    const res = await sendBulkReminders(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { sentCount: number; eligibleCount: number; failedCount: number };
    expect(body.eligibleCount).toBe(1);
    expect(body.sentCount).toBe(0);
    expect(body.failedCount).toBe(1);

    const reminded = await prisma.invoice.findUniqueOrThrow({ where: { invoiceNumber: "MGS-2026-9901" } });
    expect(reminded.lastReminderStage).toBe(7);

    const outbound = await prisma.outboundEmail.findMany({
      where: {
        toEmail: "reminder.student@example.com"
      }
    });
    expect(outbound.length).toBeGreaterThan(0);
  });

  it("blocks reminder when no higher stage is available", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const stale = await seedSentInvoice({
      adminId: admin.id,
      invoiceNumber: "MGS-2026-9903",
      dueAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
      lastReminderStage: 14
    });

    const blockedReq = adminRequest(`http://localhost/api/admin/invoices/${stale.id}/remind`, "POST", token);
    const blockedRes = await sendSingleReminder(blockedReq, { params: Promise.resolve({ id: stale.id }) });
    expect(blockedRes.status).toBe(400);

    const eligible = await seedSentInvoice({
      adminId: admin.id,
      invoiceNumber: "MGS-2026-9904",
      dueAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
      lastReminderStage: 7
    });

    const okReq = adminRequest(`http://localhost/api/admin/invoices/${eligible.id}/remind`, "POST", token);
    const okRes = await sendSingleReminder(okReq, { params: Promise.resolve({ id: eligible.id }) });
    expect(okRes.status).toBe(202);

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: eligible.id } });
    expect(reloaded.lastReminderStage).toBe(14);
  });

  it("returns partial success when reminder metadata persists but no live provider is configured", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const invoice = await seedSentInvoice({
      adminId: admin.id,
      invoiceNumber: "MGS-2026-9904A",
      dueAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
      lastReminderStage: 7
    });

    const req = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/remind`, "POST", token);
    const res = await sendSingleReminder(req, { params: Promise.resolve({ id: invoice.id }) });

    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      partial?: boolean;
      warning?: string;
      deliveryStatus?: string;
      invoice?: { lastReminderStage: number | null };
    };
    expect(body.partial).toBe(true);
    expect(body.warning).toContain("no live email provider");
    expect(body.deliveryStatus).toBe("queued_no_smtp");
    expect(body.invoice?.lastReminderStage).toBe(14);
  });

  it("returns partial success when reminder metadata persists but delivery fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const invoice = await seedSentInvoice({
      adminId: admin.id,
      invoiceNumber: "MGS-2026-9905",
      dueAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    });

    vi.spyOn(invoiceEvents, "sendCustomerInvoiceReminderEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const req = adminRequest(`http://localhost/api/admin/invoices/${invoice.id}/remind`, "POST", token);
    const res = await sendSingleReminder(req, { params: Promise.resolve({ id: invoice.id }) });

    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      partial?: boolean;
      warning?: string;
      invoice?: { lastReminderStage: number | null };
    };
    expect(body.partial).toBe(true);
    expect(body.warning).toContain("could not be delivered");
    expect(body.invoice?.lastReminderStage).toBe(7);

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reloaded.lastReminderStage).toBe(7);
    expect(reloaded.lastReminderSentAt).not.toBeNull();
  });
});
