import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { GET, POST } from "@/app/api/booking-requests/route";

describe("api-booking-requests", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("does not expose booking request rows via public GET", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");

    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Method Not Allowed");
  });

  it("creates a pending booking request even when owner email delivery is unavailable", async () => {
    const startAt = addDays(new Date(), 7).toISOString();
    const recurrenceEndAt = addDays(new Date(), 21).toISOString();

    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Taylor",
        lastName: "Swift",
        name: "Taylor Swift",
        email: "taylor@example.com",
        phone: "0401-111-111",
        unitNumber: "4",
        houseNumber: "66",
        streetName: "High",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "advanced",
        lessonDuration: "min30",
        requestedStartAt: startAt,
        isRecurring: true,
        recurrenceEndAt
      })
    });

    const response = await POST(request);
    expect([200, 503]).toContain(response.status);
    const payload = (await response.json()) as { id?: string; ok?: boolean; deliveryStatus?: string };
    expect(typeof payload.id).toBe("string");
    if (response.status === 503) {
      expect(payload.ok).toBe(false);
      expect(payload.deliveryStatus).toBe("queued_no_smtp");
    }

    const row = await prisma.bookingRequest.findUnique({
      where: {
        id: payload.id
      }
    });
    expect(row?.status).toBe("pending");
    expect(row?.isRecurring).toBe(true);
  });

  it("rejects booking requests from non-AU server-side geolocation", async () => {
    const startAt = addDays(new Date(), 7).toISOString();
    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vercel-ip-country": "US"
      },
      body: JSON.stringify({
        firstName: "Taylor",
        lastName: "Swift",
        name: "Taylor Swift",
        email: "taylor@example.com",
        phone: "0401-111-111",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "advanced",
        lessonDuration: "min30",
        requestedStartAt: startAt,
        isRecurring: false,
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("Australian residents");

    const row = await prisma.bookingRequest.findFirst({
      where: {
        email: "taylor@example.com"
      }
    });
    expect(row).toBeNull();
  });

  it("enforces 30-minute duration for new customers", async () => {
    const startAt = addDays(new Date(), 7).toISOString();

    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "New",
        lastName: "Customer",
        name: "New Customer",
        email: "new@example.com",
        phone: "0400-000-000",
        postcode: "3000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60", // Requesting 60 mins
        requestedStartAt: startAt,
        isRecurring: false,
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect([200, 503]).toContain(response.status);
    const payload = (await response.json()) as { id: string };
    
    const row = await prisma.bookingRequest.findUnique({
      where: { id: payload.id }
    });
    
    // Should be overridden to 30 mins
    expect(row?.lessonDuration).toBe("min30");
    expect(row?.customerId).toBeNull();
  });

  it("matches existing customer and preserves requested duration", async () => {
    // Create existing customer
    const customer = await prisma.customer.create({
      data: {
        fullName: "Existing Student",
        normalizedFullName: "existing student",
        email: "existing@example.com",
        normalizedEmail: "existing@example.com",
        phone: "0411 111 111",
        normalizedPhone: "0411111111",
        postcode: "3070",
        skillLevel: "intermediate",
        lessonMode: "in_person"
      }
    });

    const startAt = addDays(new Date(), 7).toISOString();

    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Existing",
        lastName: "Student",
        name: "Existing Student",
        email: "existing@example.com",
        phone: "0411-111-111",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "intermediate",
        lessonDuration: "min60", // Requesting 60 mins
        requestedStartAt: startAt,
        isRecurring: false,
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect([200, 503]).toContain(response.status);
    const payload = (await response.json()) as { id: string };
    
    const row = await prisma.bookingRequest.findUnique({
      where: { id: payload.id }
    });
    
    // Should preserve 60 mins and link to customer
    expect(row?.lessonDuration).toBe("min60");
    expect(row?.customerId).toBe(customer.id);
  });

  it("auto-assigns public booking requests when exactly one active teacher exists", async () => {
    const teacher = await prisma.adminUser.create({
      data: {
        email: "solo-teacher@example.com",
        role: "teacher",
        firstName: "Solo",
        lastName: "Teacher",
        displayName: "Solo Teacher",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });

    const startAt = addDays(new Date(), 7).toISOString();

    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Auto",
        lastName: "Assigned",
        name: "Auto Assigned",
        email: "auto.assigned@example.com",
        phone: "0401-222-333",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: startAt,
        isRecurring: false,
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect([200, 503]).toContain(response.status);
    const payload = (await response.json()) as { id: string };

    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: payload.id }
    });
    expect(row.assignedTeacherId).toBe(teacher.id);
  });
});
