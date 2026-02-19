import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/booking-requests/route";

describe("api-booking-requests", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingRequest.deleteMany();
  });

  it("creates a pending booking request", async () => {
    const startAt = addDays(new Date(), 7).toISOString();
    const recurrenceEndAt = addDays(new Date(), 21).toISOString();

    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Taylor",
        email: "taylor@example.com",
        phone: "0401111111",
        address: "66 High Street, Northcote",
        lessonMode: "video",
        skillLevel: "advanced",
        lessonDuration: "min30",
        requestedStartAt: startAt,
        isRecurring: true,
        recurrenceEndAt
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const row = await prisma.bookingRequest.findFirst();
    expect(row?.status).toBe("pending");
    expect(row?.isRecurring).toBe(true);
  });
});
