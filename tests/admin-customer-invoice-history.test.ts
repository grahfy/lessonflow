import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/admin/customers/[id]/invoices/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminRequest(url: string, method: "GET" | "POST", token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-customer-invoice-history", () => {
  beforeEach(async () => {
    // RATIONALE: Customer invoice history joins billing rows back through
    // bookings and customers, so each scenario starts from a clean billing graph.
    await prisma.invoiceAuditLog.deleteMany();
    await prisma.invoiceBookingLink.deleteMany();
    await prisma.invoiceLineItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.lessonPricingOption.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("creates and lists invoices scoped to a customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customer = await prisma.customer.create({
      data: {
        firstName: "Invoice",
        lastName: "Student",
        fullName: "Invoice Student",
        email: "invoice.student@example.com",
        phone: "0400111000",
        normalizedEmail: "invoice.student@example.com",
        normalizedPhone: "0400111000",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }
    });

    const booking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min60",
        startAt: new Date("2026-09-15T08:00:00.000Z"),
        endAt: new Date("2026-09-15T09:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices`, "POST", token, {
      bookingId: booking.id,
      taxMode: "taxable",
      lineItems: [
        {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 11000,
          taxMode: "taxable",
          sortOrder: 0
        }
      ]
    });
    const createRes = await POST(createReq, { params: Promise.resolve({ id: customer.id }) });
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { invoice: { bookingId: string | null } };
    expect(createBody.invoice.bookingId).toBe(booking.id);

    const listReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices?outstanding=true`, "GET", token);
    const listRes = await GET(listReq, { params: Promise.resolve({ id: customer.id }) });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { invoices: Array<{ customerId: string; customerEmail: string }> };

    // NOTE: The customer-specific endpoint should never leak invoices from the
    // broader admin list, even when other invoice search filters exist elsewhere.
    expect(listBody.invoices.length).toBe(1);
    expect(listBody.invoices[0].customerId).toBe(customer.id);
    expect(listBody.invoices[0].customerEmail).toBe("invoice.student@example.com");
  });

  it("rejects linking a booking that belongs to another customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customerA = await prisma.customer.create({
      data: {
        firstName: "Customer",
        lastName: "A",
        fullName: "Customer A",
        email: "customer-a@example.com",
        phone: "0400000001",
        normalizedEmail: "customer-a@example.com",
        normalizedPhone: "0400000001",
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
        firstName: "Customer",
        lastName: "B",
        fullName: "Customer B",
        email: "customer-b@example.com",
        phone: "0400000002",
        normalizedEmail: "customer-b@example.com",
        normalizedPhone: "0400000002",
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

    const bookingB = await prisma.booking.create({
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
        startAt: new Date("2026-10-01T08:00:00.000Z"),
        endAt: new Date("2026-10-01T09:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customerB.id,
        modifiedById: admin.id
      }
    });

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customerA.id}/invoices`, "POST", token, {
      bookingId: bookingB.id,
      taxMode: "taxable",
      lineItems: [
        {
          kind: "custom",
          description: "Standalone admin charge",
          quantity: 1,
          unitPriceCents: 3000,
          taxMode: "taxable",
          sortOrder: 0
        }
      ]
    });
    const createRes = await POST(createReq, { params: Promise.resolve({ id: customerA.id }) });
    // RATIONALE: Cross-customer booking linking would corrupt invoice history
    // and payment follow-up, so the route must reject it explicitly.
    expect(createRes.status).toBe(400);
  });

  it("returns booking options with invoice eligibility metadata", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.lessonPricingOption.createMany({
      data: [
        { durationMinutes: 30, priceCents: 5000, isActive: true, sortOrder: 0 },
        { durationMinutes: 60, priceCents: 9000, isActive: true, sortOrder: 1 }
      ]
    });

    const customer = await prisma.customer.create({
      data: {
        firstName: "Invoice",
        lastName: "Metadata",
        fullName: "Invoice Metadata",
        email: "invoice-metadata@example.com",
        phone: "0400111003",
        normalizedEmail: "invoice-metadata@example.com",
        normalizedPhone: "0400111003",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const selectableBooking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min30",
        startAt: new Date("2026-09-15T08:00:00.000Z"),
        endAt: new Date("2026-09-15T08:30:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const alreadyInvoicedBooking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min60",
        startAt: new Date("2026-09-16T08:00:00.000Z"),
        endAt: new Date("2026-09-16T09:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: "INV-EXISTING",
        status: "draft",
        documentType: "invoice",
        currency: "AUD",
        taxMode: "taxable",
        customerId: customer.id,
        bookingId: alreadyInvoicedBooking.id,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerName: customer.fullName,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerAddress: "10 Main Street, Northcote VIC 3070",
        sellerBusinessName: "School",
        sellerAbn: "12345678901",
        sellerEmail: "school@example.com",
        bankName: "Bank",
        bankBsb: "123-456",
        bankAccountName: "School",
        bankAccountNumber: "12345678",
        subtotalCents: 9000,
        gstCents: 900,
        totalCents: 9900,
        issuedAt: new Date("2026-09-16T00:00:00.000Z"),
        dueAt: new Date("2026-09-30T00:00:00.000Z")
      }
    });
    await prisma.invoiceBookingLink.create({
      data: {
        invoiceId: invoice.id,
        bookingId: alreadyInvoicedBooking.id
      }
    });

    const listReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices?bookingOptions=true`, "GET", token);
    const listRes = await GET(listReq, { params: Promise.resolve({ id: customer.id }) });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      bookingOptions: Array<{
        id: string;
        durationMinutes: number;
        isInvoiceSelectable: boolean;
        invoiceIneligibilityReason: string | null;
        linkedInvoiceId: string | null;
      }>;
    };

    const selectable = listBody.bookingOptions.find((option) => option.id === selectableBooking.id);
    const alreadyLinked = listBody.bookingOptions.find((option) => option.id === alreadyInvoicedBooking.id);
    expect(selectable).toMatchObject({
      durationMinutes: 30,
      isInvoiceSelectable: true,
      invoiceIneligibilityReason: null,
      linkedInvoiceId: null
    });
    expect(alreadyLinked).toMatchObject({
      durationMinutes: 60,
      isInvoiceSelectable: false,
      invoiceIneligibilityReason: "already_invoiced",
      linkedInvoiceId: invoice.id
    });
  });

  it("treats legacy bookingId invoices as already invoiced even without join rows", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.lessonPricingOption.create({
      data: { durationMinutes: 60, priceCents: 9000, isActive: true, sortOrder: 0 }
    });

    const customer = await prisma.customer.create({
      data: {
        firstName: "Legacy",
        lastName: "Link",
        fullName: "Legacy Link",
        email: "legacy-link@example.com",
        phone: "0400111005",
        normalizedEmail: "legacy-link@example.com",
        normalizedPhone: "0400111005",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const booking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min60",
        startAt: new Date("2026-09-18T08:00:00.000Z"),
        endAt: new Date("2026-09-18T09:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const legacyInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: "INV-LEGACY",
        status: "draft",
        documentType: "invoice",
        currency: "AUD",
        taxMode: "taxable",
        customerId: customer.id,
        bookingId: booking.id,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerName: customer.fullName,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerAddress: "10 Main Street, Northcote VIC 3070",
        sellerBusinessName: "School",
        sellerAbn: "12345678901",
        sellerEmail: "school@example.com",
        bankName: "Bank",
        bankBsb: "123-456",
        bankAccountName: "School",
        bankAccountNumber: "12345678",
        subtotalCents: 9000,
        gstCents: 900,
        totalCents: 9900,
        issuedAt: new Date("2026-09-18T00:00:00.000Z"),
        dueAt: new Date("2026-10-02T00:00:00.000Z")
      }
    });

    const listReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices?bookingOptions=true`, "GET", token);
    const listRes = await GET(listReq, { params: Promise.resolve({ id: customer.id }) });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      bookingOptions: Array<{
        id: string;
        isInvoiceSelectable: boolean;
        invoiceIneligibilityReason: string | null;
        linkedInvoiceId: string | null;
      }>;
    };

    expect(listBody.bookingOptions[0]).toMatchObject({
      id: booking.id,
      isInvoiceSelectable: false,
      invoiceIneligibilityReason: "already_invoiced",
      linkedInvoiceId: legacyInvoice.id
    });

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices`, "POST", token, {
      bookingId: booking.id,
      taxMode: "taxable",
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
    const createRes = await POST(createReq, { params: Promise.resolve({ id: customer.id }) });
    expect(createRes.status).toBe(400);
  });

  it("returns all matching customer bookings instead of truncating at eighty rows", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.lessonPricingOption.create({
      data: { durationMinutes: 60, priceCents: 9000, isActive: true, sortOrder: 0 }
    });

    const customer = await prisma.customer.create({
      data: {
        firstName: "Many",
        lastName: "Bookings",
        fullName: "Many Bookings",
        email: "many-bookings@example.com",
        phone: "0400111006",
        normalizedEmail: "many-bookings@example.com",
        normalizedPhone: "0400111006",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    await prisma.booking.createMany({
      data: Array.from({ length: 81 }, (_, index) => {
        const day = String((index % 28) + 1).padStart(2, "0");
        return {
          name: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          address: "10 Main Street, Northcote VIC 3070",
          houseNumber: "10",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
          lessonMode: "in_person",
          skillLevel: customer.skillLevel,
          lessonDuration: "min60",
          startAt: new Date(`2026-10-${day}T08:00:00.000Z`),
          endAt: new Date(`2026-10-${day}T09:00:00.000Z`),
          timezone: "Australia/Melbourne",
          customerId: customer.id,
          modifiedById: admin.id
        };
      })
    });

    const listReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices?bookingOptions=true`, "GET", token);
    const listRes = await GET(listReq, { params: Promise.resolve({ id: customer.id }) });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      bookingOptions: Array<{ id: string }>;
    };

    expect(listBody.bookingOptions).toHaveLength(81);
  });

  it("creates grouped lesson line items from selected booking ids", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.lessonPricingOption.createMany({
      data: [
        { durationMinutes: 30, priceCents: 5000, isActive: true, sortOrder: 0 },
        { durationMinutes: 60, priceCents: 9000, isActive: true, sortOrder: 1 }
      ]
    });

    const customer = await prisma.customer.create({
      data: {
        firstName: "Grouped",
        lastName: "Invoices",
        fullName: "Grouped Invoices",
        email: "grouped-invoices@example.com",
        phone: "0400111004",
        normalizedEmail: "grouped-invoices@example.com",
        normalizedPhone: "0400111004",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const bookingA = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min30",
        startAt: new Date("2026-09-15T08:00:00.000Z"),
        endAt: new Date("2026-09-15T08:30:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });
    const bookingB = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min30",
        startAt: new Date("2026-09-16T08:00:00.000Z"),
        endAt: new Date("2026-09-16T08:30:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });
    const bookingC = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min60",
        startAt: new Date("2026-09-17T08:00:00.000Z"),
        endAt: new Date("2026-09-17T09:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices`, "POST", token, {
      bookingIds: [bookingA.id, bookingB.id, bookingC.id],
      taxMode: "taxable"
    });
    const createRes = await POST(createReq, { params: Promise.resolve({ id: customer.id }) });
    expect(createRes.status).toBe(201);

    const createBody = (await createRes.json()) as {
      invoice: {
        id: string;
        bookingId: string | null;
        subtotalCents: number;
        lineItems: Array<{ description: string; quantity: number; unitPriceCents: number }>;
      };
    };

    expect(createBody.invoice.bookingId).toBe(bookingA.id);
    expect(createBody.invoice.subtotalCents).toBe(19000);
    expect(createBody.invoice.lineItems).toHaveLength(2);
    expect(createBody.invoice.lineItems[0]).toMatchObject({
      description: "2 x 30 minute lessons",
      quantity: 2,
      unitPriceCents: 5000
    });
    expect(createBody.invoice.lineItems[1]).toMatchObject({
      description: "1 x 60 minute lesson",
      quantity: 1,
      unitPriceCents: 9000
    });

    const links = await prisma.invoiceBookingLink.findMany({
      where: { invoiceId: createBody.invoice.id },
      orderBy: { bookingId: "asc" }
    });
    expect(links.map((link) => link.bookingId).sort()).toEqual([bookingA.id, bookingB.id, bookingC.id].sort());
  });

  it("creates one invoice from lesson bookings plus manual line items", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.lessonPricingOption.createMany({
      data: [
        {
          durationMinutes: 30,
          priceCents: 5000,
          isActive: true,
          sortOrder: 0
        }
      ]
    });

    const customer = await prisma.customer.create({
      data: {
        fullName: "Mixed Sources",
        email: "mixed.sources@example.com",
        phone: "0400111888",
        normalizedEmail: "mixed.sources@example.com",
        normalizedPhone: "0400111888",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const booking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min30",
        startAt: new Date("2026-09-18T08:00:00.000Z"),
        endAt: new Date("2026-09-18T08:30:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices`, "POST", token, {
      bookingIds: [booking.id],
      taxMode: "taxable",
      lineItems: [
        {
          description: "Instrument rental",
          quantity: 1,
          unitPriceCents: 2500,
          kind: "custom",
          taxMode: "taxable",
          sortOrder: 0
        },
        {
          description: "Printed music pack",
          quantity: 1,
          unitPriceCents: 1500,
          kind: "custom",
          taxMode: "taxable",
          sortOrder: 1
        }
      ]
    });
    const createRes = await POST(createReq, { params: Promise.resolve({ id: customer.id }) });
    expect(createRes.status).toBe(201);

    const createBody = (await createRes.json()) as {
      invoice: {
        bookingId: string | null;
        subtotalCents: number;
        lineItems: Array<{ description: string; quantity: number; unitPriceCents: number }>;
      };
    };

    expect(createBody.invoice.bookingId).toBe(booking.id);
    expect(createBody.invoice.subtotalCents).toBe(9000);
    expect(createBody.invoice.lineItems).toHaveLength(3);
    expect(createBody.invoice.lineItems[0]).toMatchObject({
      description: "1 x 30 minute lesson",
      quantity: 1,
      unitPriceCents: 5000
    });
    expect(createBody.invoice.lineItems[1]).toMatchObject({
      description: "Instrument rental",
      quantity: 1,
      unitPriceCents: 2500
    });
    expect(createBody.invoice.lineItems[2]).toMatchObject({
      description: "Printed music pack",
      quantity: 1,
      unitPriceCents: 1500
    });
  });
});
