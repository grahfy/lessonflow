import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/booking-requests/route";

describe("booking-notifications", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("records an outbound email for the owner when a booking request is submitted", async () => {
    const startAt = addDays(new Date(), 7).toISOString();

    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Test",
        lastName: "Customer",
        name: "Test Customer",
        email: "test@example.com",
        phone: "0400-000-000",
        postcode: "3000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: startAt,
        isRecurring: false,
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    // 200 if email sent, 503 if queued/failed (still recorded in DB)
    expect([200, 503]).toContain(response.status);

    const outboundEmails = await prisma.outboundEmail.findMany();
    expect(outboundEmails.length).toBeGreaterThan(0);
    
    const ownerEmail = outboundEmails.find(e => e.subject.toLowerCase().includes("new booking request"));
    expect(ownerEmail).toBeDefined();
    expect(ownerEmail?.to).toBe(process.env.ADMIN_EMAIL || "admin@example.com");
  });
});
