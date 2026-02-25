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
        name: "Taylor",
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
});
