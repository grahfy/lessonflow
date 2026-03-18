import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createBookingInvoice } from "@/app/api/admin/bookings/[id]/invoice/route";
import { PATCH as patchInvoice } from "@/app/api/admin/invoices/[id]/route";
import { POST as sendInvoice } from "@/app/api/admin/invoices/[id]/send/route";
import { GET, POST } from "@/app/api/admin/invoices/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminRequest(url: string, method: "GET" | "POST" | "PATCH", token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-invoices", () => {
  beforeEach(async () => {
    // RATIONALE: Invoice flows span billing rows, line items, bookings, and
    // sometimes booking-originated invoice creation, so tests reset the full graph.
    await prisma.invoiceAuditLog.deleteMany();
    await prisma.invoiceLineItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("rejects unauthenticated invoice list requests", async () => {
    const req = new NextRequest("http://localhost/api/admin/invoices");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("creates overdue invoices and excludes paid invoices from overdue filter", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const overdueDueAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const createReq = adminRequest("http://localhost/api/admin/invoices", "POST", token, {
      customerFirstName: "Alex",
      customerLastName: "Student",
      customerName: "Alex Student",
      customerEmail: "alex@example.com",
      customerPhone: "0400123456",
      customerAddress: "10 Main Street, Northcote VIC 3070",
      taxMode: "taxable",
      dueAt: overdueDueAt,
      lineItems: [
        {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 9000,
          taxMode: "taxable",
          sortOrder: 0
        }
      ]
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as { invoice: { id: string } };

    const outstandingBeforeReq = adminRequest("http://localhost/api/admin/invoices?outstanding=true", "GET", token);
    const outstandingBeforeRes = await GET(outstandingBeforeReq);
    expect(outstandingBeforeRes.status).toBe(200);
    const outstandingBeforeBody = (await outstandingBeforeRes.json()) as { invoices: Array<{ id: string }> };
    expect(outstandingBeforeBody.invoices.some((invoice) => invoice.id === createdBody.invoice.id)).toBe(true);

    const sendReq = adminRequest(`http://localhost/api/admin/invoices/${createdBody.invoice.id}/send`, "POST", token);
    const sendRes = await sendInvoice(sendReq, { params: Promise.resolve({ id: createdBody.invoice.id }) });
    expect(sendRes.status).toBe(202);

    const markPaidReq = adminRequest(`http://localhost/api/admin/invoices/${createdBody.invoice.id}`, "PATCH", token, {
      action: "mark_paid"
    });
    const markPaidRes = await patchInvoice(markPaidReq, {
      params: Promise.resolve({ id: createdBody.invoice.id })
    });
    expect(markPaidRes.status).toBe(200);

    const outstandingAfterReq = adminRequest("http://localhost/api/admin/invoices?outstanding=true", "GET", token);
    const outstandingAfterRes = await GET(outstandingAfterReq);
    expect(outstandingAfterRes.status).toBe(200);
    const outstandingAfterBody = (await outstandingAfterRes.json()) as { invoices: Array<{ id: string }> };
    // NOTE: Once paid, the invoice should disappear from the outstanding view
    // even if its original due date is still in the past.
    expect(outstandingAfterBody.invoices.some((invoice) => invoice.id === createdBody.invoice.id)).toBe(false);
  });

  it("creates draft invoice from booking endpoint", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Booking Student",
        email: "booking.student@example.com",
        phone: "0400111222",
        address: "22 High Street, Fitzroy VIC 3065",
        houseNumber: "22",
        streetName: "High",
        streetType: "Street",
        suburb: "Fitzroy",
        state: "VIC",
        postcode: "3065",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-07-10T09:00:00.000Z"),
        endAt: new Date("2026-07-10T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    const req = adminRequest(`http://localhost/api/admin/bookings/${booking.id}/invoice`, "POST", token, {
      taxMode: "taxable",
      lineItems: [
        {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 9500,
          taxMode: "taxable",
          sortOrder: 0
        },
        {
          kind: "educational_books",
          description: "Educational books",
          quantity: 1,
          unitPriceCents: 1500,
          taxMode: "taxable",
          sortOrder: 1
        },
        {
          kind: "digital_lessons",
          description: "Digital lessons",
          quantity: 1,
          unitPriceCents: 2000,
          taxMode: "taxable",
          sortOrder: 2
        },
        {
          kind: "custom",
          description: "String pack",
          quantity: 1,
          unitPriceCents: 3000,
          taxMode: "taxable",
          sortOrder: 3
        }
      ]
    });
    const res = await createBookingInvoice(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { invoice: { status: string; bookingId: string; lineItems: Array<{ description: string }> } };
    expect(body.invoice.status).toBe("draft");
    expect(body.invoice.bookingId).toBe(booking.id);
    expect(body.invoice.lineItems.length).toBe(4);
  });

  it("creates discounted invoices and keeps draft/sent invoices editable while locking paid invoices", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const createReq = adminRequest("http://localhost/api/admin/invoices", "POST", token, {
      customerFirstName: "Discount",
      customerLastName: "Student",
      customerName: "Discount Student",
      customerEmail: "discount@example.com",
      customerPhone: "0400123000",
      customerAddress: "10 Main Street, Northcote VIC 3070",
      taxMode: "taxable",
      dueAt: "2026-08-01T10:00:00.000Z",
      discountKind: "percent",
      discountValue: 1000,
      lineItems: [
        {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 10000,
          taxMode: "taxable",
          sortOrder: 0,
          discountKind: "amount",
          discountValue: 500
        },
        {
          kind: "custom",
          description: "Books",
          quantity: 1,
          unitPriceCents: 3000,
          taxMode: "taxable",
          sortOrder: 1
        }
      ]
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as {
      invoice: {
        id: string;
        subtotalCents: number;
        discountCents: number;
        gstCents: number;
        totalCents: number;
        lineItems: Array<{ id: string; description: string; lineDiscountCents: number }>;
      };
    };

    expect(createBody.invoice.lineItems[0].lineDiscountCents).toBe(500);
    expect(createBody.invoice.subtotalCents).toBe(12500);
    expect(createBody.invoice.discountCents).toBe(1250);
    expect(createBody.invoice.gstCents).toBe(1125);
    expect(createBody.invoice.totalCents).toBe(12375);

    const updateDraftReq = adminRequest(`http://localhost/api/admin/invoices/${createBody.invoice.id}`, "PATCH", token, {
      action: "edit",
      discountKind: "amount",
      discountValue: 1000,
      lineItems: [
        {
          id: createBody.invoice.lineItems[0].id,
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 10000,
          taxMode: "taxable",
          sortOrder: 0,
          discountKind: "percent",
          discountValue: 2000
        },
        {
          id: createBody.invoice.lineItems[1].id,
          kind: "custom",
          description: "Books",
          quantity: 1,
          unitPriceCents: 3000,
          taxMode: "taxable",
          sortOrder: 1
        }
      ]
    });
    const updateDraftRes = await patchInvoice(updateDraftReq, { params: Promise.resolve({ id: createBody.invoice.id }) });
    expect(updateDraftRes.status).toBe(200);
    const updateDraftBody = (await updateDraftRes.json()) as {
      invoice: {
        lineItems: Array<{ id: string }>;
      };
    };

    const sendReq = adminRequest(`http://localhost/api/admin/invoices/${createBody.invoice.id}/send`, "POST", token);
    const sendRes = await sendInvoice(sendReq, { params: Promise.resolve({ id: createBody.invoice.id }) });
    expect(sendRes.status).toBe(202);

    const reorderSentReq = adminRequest(`http://localhost/api/admin/invoices/${createBody.invoice.id}`, "PATCH", token, {
      action: "edit",
      notes: "Sent invoice note update",
      lineItems: [
        {
          id: updateDraftBody.invoice.lineItems[1].id,
          kind: "custom",
          description: "Books updated",
          quantity: 1,
          unitPriceCents: 3000,
          taxMode: "taxable",
          sortOrder: 0
        },
        {
          id: updateDraftBody.invoice.lineItems[0].id,
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 10000,
          taxMode: "taxable",
          sortOrder: 1,
          discountKind: "percent",
          discountValue: 2000
        }
      ]
    });
    const reorderSentRes = await patchInvoice(reorderSentReq, { params: Promise.resolve({ id: createBody.invoice.id }) });
    expect(reorderSentRes.status).toBe(200);

    const updateSentReq = adminRequest(`http://localhost/api/admin/invoices/${createBody.invoice.id}`, "PATCH", token, {
      action: "edit",
      discountKind: "amount",
      discountValue: 1500,
      lineItems: [
        {
          id: updateDraftBody.invoice.lineItems[0].id,
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 10000,
          taxMode: "taxable",
          sortOrder: 0,
          discountKind: "percent",
          discountValue: 2500
        }
      ]
    });
    const updateSentRes = await patchInvoice(updateSentReq, { params: Promise.resolve({ id: createBody.invoice.id }) });
    expect(updateSentRes.status).toBe(200);
    const updateSentBody = (await updateSentRes.json()) as {
      invoice: {
        customerFirstName: string;
        customerLastName: string;
        discountKind: string | null;
        discountValue: number | null;
        lineItems: Array<{
          description: string;
          discountKind: string | null;
          discountValue: number | null;
        }>;
      };
    };
    expect(updateSentBody.invoice.customerFirstName).toBe("Discount");
    expect(updateSentBody.invoice.customerLastName).toBe("Student");
    expect(updateSentBody.invoice.discountKind).toBe("amount");
    expect(updateSentBody.invoice.discountValue).toBe(1500);
    expect(updateSentBody.invoice.lineItems).toHaveLength(1);
    expect(updateSentBody.invoice.lineItems[0]).toMatchObject({
      description: "Lesson fee",
      discountKind: "percent",
      discountValue: 2500
    });

    const markPaidReq = adminRequest(`http://localhost/api/admin/invoices/${createBody.invoice.id}`, "PATCH", token, {
      action: "mark_paid"
    });
    const markPaidRes = await patchInvoice(markPaidReq, { params: Promise.resolve({ id: createBody.invoice.id }) });
    expect(markPaidRes.status).toBe(200);

    const updatePaidReq = adminRequest(`http://localhost/api/admin/invoices/${createBody.invoice.id}`, "PATCH", token, {
      action: "edit",
      notes: "Should not save after payment"
    });
    const updatePaidRes = await patchInvoice(updatePaidReq, { params: Promise.resolve({ id: createBody.invoice.id }) });
    expect(updatePaidRes.status).toBe(400);
    const updatePaidBody = (await updatePaidRes.json()) as { error: string };
    expect(updatePaidBody.error).toBe("Paid or void invoices cannot be edited directly.");
  });

  it("filters invoice list by aging bucket", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.invoice.create({
      data: {
        invoiceNumber: "MGS-2026-8801",
        status: "sent",
        taxMode: "taxable",
        customerName: "Current Student",
        customerEmail: "current@example.com",
        customerPhone: "0400000001",
        customerAddress: "1 Main Street",
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
        dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
        updatedById: admin.id,
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

    await prisma.invoice.create({
      data: {
        invoiceNumber: "MGS-2026-8802",
        status: "sent",
        taxMode: "taxable",
        customerName: "Overdue Student",
        customerEmail: "overdue@example.com",
        customerPhone: "0400000002",
        customerAddress: "2 Main Street",
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
        dueAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
        updatedById: admin.id,
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

    const req = adminRequest("http://localhost/api/admin/invoices?agingBucket=overdue_31_plus", "GET", token);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoices: Array<{ invoiceNumber: string; agingBucket: string }> };

    // RATIONALE: Aging filters drive collection follow-up, so the bucket result
    // must line up with the invoice that is materially overdue.
    expect(body.invoices.length).toBe(1);
    expect(body.invoices[0].invoiceNumber).toBe("MGS-2026-8802");
    expect(body.invoices[0].agingBucket).toBe("overdue_31_plus");
  });

  it("sorts invoices by requested field and direction", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const createInvoiceRow = async (input: {
      invoiceNumber: string;
      customerFirstName: string;
      customerLastName: string;
      customerName: string;
      status: "draft" | "sent" | "paid" | "void";
      totalCents: number;
      dueAt: Date;
    }) => {
      await prisma.invoice.create({
        data: {
          invoiceNumber: input.invoiceNumber,
          status: input.status,
          taxMode: "taxable",
          customerFirstName: input.customerFirstName,
          customerLastName: input.customerLastName,
          customerName: input.customerName,
          customerEmail: `${input.customerFirstName.toLowerCase()}@example.com`,
          customerPhone: "0400000000",
          customerAddress: "1 Main Street",
          sellerBusinessName: "Melbourne Guitar School",
          sellerAbn: "12345678901",
          sellerEmail: "no-reply@example.com",
          bankName: "ANZ",
          bankBsb: "013001",
          bankAccountName: "Melbourne Guitar School",
          bankAccountNumber: "12345678",
          subtotalCents: input.totalCents,
          gstCents: 0,
          totalCents: input.totalCents,
          issuedAt: new Date("2026-02-01T00:00:00.000Z"),
          dueAt: input.dueAt,
          createdById: admin.id,
          updatedById: admin.id,
          lineItems: {
            create: {
              kind: "lesson_fee",
              description: "Lesson",
              quantity: 1,
              unitPriceCents: input.totalCents,
              taxMode: "taxable",
              lineSubtotalCents: input.totalCents,
              lineGstCents: 0,
              lineTotalCents: input.totalCents,
              sortOrder: 0
            }
          }
        }
      });
    };

    await createInvoiceRow({
      invoiceNumber: "MGS-2026-1001",
      customerFirstName: "Amy",
      customerLastName: "Baker",
      customerName: "Amy Baker",
      status: "draft",
      totalCents: 4000,
      dueAt: new Date("2026-06-01T00:00:00.000Z")
    });
    await createInvoiceRow({
      invoiceNumber: "MGS-2026-1003",
      customerFirstName: "Zoe",
      customerLastName: "Adams",
      customerName: "Zoe Adams",
      status: "paid",
      totalCents: 7000,
      dueAt: new Date("2026-04-01T00:00:00.000Z")
    });
    await createInvoiceRow({
      invoiceNumber: "MGS-2026-1002",
      customerFirstName: "Ben",
      customerLastName: "Carter",
      customerName: "Ben Carter",
      status: "sent",
      totalCents: 5000,
      dueAt: new Date("2026-05-01T00:00:00.000Z")
    });
    await createInvoiceRow({
      invoiceNumber: "MGS-2026-1004",
      customerFirstName: "Mia",
      customerLastName: "Doyle",
      customerName: "Mia Doyle",
      status: "void",
      totalCents: 3000,
      dueAt: new Date("2026-03-01T00:00:00.000Z")
    });

    const fetchInvoiceNumbers = async (
      sortBy: "invoice_number" | "customer_last_name" | "status" | "total" | "due_date",
      sortDir: "asc" | "desc"
    ) => {
      const req = adminRequest(
        `http://localhost/api/admin/invoices?page=1&pageSize=100&sortBy=${sortBy}&sortDir=${sortDir}`,
        "GET",
        token
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { invoices: Array<{ invoiceNumber: string }> };
      return body.invoices.map((invoice) => invoice.invoiceNumber);
    };

    expect(await fetchInvoiceNumbers("invoice_number", "asc")).toEqual([
      "MGS-2026-1001",
      "MGS-2026-1002",
      "MGS-2026-1003",
      "MGS-2026-1004"
    ]);
    expect(await fetchInvoiceNumbers("invoice_number", "desc")).toEqual([
      "MGS-2026-1004",
      "MGS-2026-1003",
      "MGS-2026-1002",
      "MGS-2026-1001"
    ]);

    expect(await fetchInvoiceNumbers("customer_last_name", "asc")).toEqual([
      "MGS-2026-1003",
      "MGS-2026-1001",
      "MGS-2026-1002",
      "MGS-2026-1004"
    ]);
    expect(await fetchInvoiceNumbers("customer_last_name", "desc")).toEqual([
      "MGS-2026-1004",
      "MGS-2026-1002",
      "MGS-2026-1001",
      "MGS-2026-1003"
    ]);

    expect(await fetchInvoiceNumbers("status", "asc")).toEqual([
      "MGS-2026-1001",
      "MGS-2026-1002",
      "MGS-2026-1003",
      "MGS-2026-1004"
    ]);
    expect(await fetchInvoiceNumbers("status", "desc")).toEqual([
      "MGS-2026-1004",
      "MGS-2026-1003",
      "MGS-2026-1002",
      "MGS-2026-1001"
    ]);

    expect(await fetchInvoiceNumbers("total", "asc")).toEqual([
      "MGS-2026-1004",
      "MGS-2026-1001",
      "MGS-2026-1002",
      "MGS-2026-1003"
    ]);
    expect(await fetchInvoiceNumbers("total", "desc")).toEqual([
      "MGS-2026-1003",
      "MGS-2026-1002",
      "MGS-2026-1001",
      "MGS-2026-1004"
    ]);

    expect(await fetchInvoiceNumbers("due_date", "asc")).toEqual([
      "MGS-2026-1004",
      "MGS-2026-1003",
      "MGS-2026-1002",
      "MGS-2026-1001"
    ]);
    expect(await fetchInvoiceNumbers("due_date", "desc")).toEqual([
      "MGS-2026-1001",
      "MGS-2026-1002",
      "MGS-2026-1003",
      "MGS-2026-1004"
    ]);
  });

  it("rejects global create when booking and customer do not match", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customerA = await prisma.customer.create({
      data: {
        fullName: "Mismatch A",
        email: "mismatch-a@example.com",
        phone: "0400001111",
        normalizedEmail: "mismatch-a@example.com",
        normalizedPhone: "0400001111",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "1",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }
    });

    const customerB = await prisma.customer.create({
      data: {
        fullName: "Mismatch B",
        email: "mismatch-b@example.com",
        phone: "0400002222",
        normalizedEmail: "mismatch-b@example.com",
        normalizedPhone: "0400002222",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "2",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }
    });

    const booking = await prisma.booking.create({
      data: {
        name: customerB.fullName,
        email: customerB.email,
        phone: customerB.phone,
        address: "2 Main Street, Northcote VIC 3070",
        houseNumber: "2",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customerB.skillLevel,
        lessonDuration: "min60",
        startAt: new Date("2026-09-01T09:00:00.000Z"),
        endAt: new Date("2026-09-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customerB.id,
        modifiedById: admin.id
      }
    });

    const req = adminRequest("http://localhost/api/admin/invoices", "POST", token, {
      customerId: customerA.id,
      bookingId: booking.id,
      customerFirstName: "Mismatch",
      customerLastName: "A",
      customerName: customerA.fullName,
      customerEmail: customerA.email,
      customerPhone: customerA.phone,
      customerAddress: "1 Main Street, Northcote VIC 3070",
      taxMode: "taxable",
      dueAt: "2026-08-01T10:00:00.000Z",
      lineItems: [
        {
          kind: "custom",
          description: "Standalone charge",
          quantity: 1,
          unitPriceCents: 5000,
          taxMode: "taxable",
          sortOrder: 0
        }
      ]
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
