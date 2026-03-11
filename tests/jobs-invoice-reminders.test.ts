import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as runInvoiceReminderJob } from "@/app/api/jobs/invoice-reminders/route";
import { prisma } from "@/lib/db";
import { ensureOwnerAdmin } from "@/lib/admin-auth";

function jobRequest(secret?: string, body?: Record<string, unknown>) {
  const headers = new Headers({
    "content-type": "application/json"
  });

  if (secret) {
    headers.set("x-cron-secret", secret);
  }

  return new NextRequest("http://localhost/api/jobs/invoice-reminders", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

/** Seeds one overdue sent invoice that should qualify for reminder processing. */
async function seedSentOverdueInvoice(invoiceNumber: string, dueDaysAgo: number) {
  const owner = await prisma.adminUser.findFirst();

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      status: "sent",
      documentType: "invoice",
      taxMode: "taxable",
      customerName: "Cron Student",
      customerEmail: "cron.student@example.com",
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
      dueAt: new Date(Date.now() - dueDaysAgo * 24 * 60 * 60 * 1000),
      createdById: owner?.id,
      updatedById: owner?.id,
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

describe("jobs-invoice-reminders", () => {
  beforeEach(async () => {
    // NOTE: The reminder job reads invoices, creates outbound email, and writes
    // audit rows, so all three surfaces must be reset for deterministic counts.
    await prisma.invoiceAuditLog.deleteMany();
    await prisma.invoiceLineItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.outboundEmail.deleteMany();
    await prisma.adminUser.deleteMany();
    await ensureOwnerAdmin();
  });

  it("rejects requests with missing or invalid cron secret", async () => {
    const noSecretRes = await runInvoiceReminderJob(jobRequest());
    expect(noSecretRes.status).toBe(401);

    const badSecretRes = await runInvoiceReminderJob(jobRequest("wrong-secret"));
    expect(badSecretRes.status).toBe(401);
  });

  it("sends overdue reminders when cron secret is valid", async () => {
    await seedSentOverdueInvoice("MGS-2026-9701", 9);

    const res = await runInvoiceReminderJob(jobRequest(process.env.CRON_SECRET || "test-cron-secret", {}));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; sentCount: number; eligibleCount: number; failedCount: number };
    expect(body.ok).toBe(true);
    expect(body.eligibleCount).toBe(1);
    expect(body.sentCount).toBe(1);
    expect(body.failedCount).toBe(0);

    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { invoiceNumber: "MGS-2026-9701" } });
    expect(updatedInvoice.lastReminderStage).toBe(7);

    const audit = await prisma.invoiceAuditLog.findFirst({
      where: {
        invoiceId: updatedInvoice.id,
        action: "reminder_sent"
      }
    });
    expect(audit).not.toBeNull();

    const outbound = await prisma.outboundEmail.findMany({
      where: {
        toEmail: "cron.student@example.com"
      }
    });
    // RATIONALE: The cron route should both update domain state and enqueue the
    // actual outbound email, not just report eligibility counts.
    expect(outbound.length).toBeGreaterThan(0);
  });
});
