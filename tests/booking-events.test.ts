import { beforeEach, describe, expect, it } from "vitest";

import { sendCustomerBookingStatusEmail } from "@/lib/booking-events";
import { prisma } from "@/lib/db";

describe("booking-events", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
  });

  it("queues customer status email when smtp is not configured", async () => {
    await sendCustomerBookingStatusEmail({
      email: "student@example.com",
      name: "Student",
      status: "approved",
      when: new Date("2026-05-03T09:00:00.000Z")
    });

    const row = await prisma.outboundEmail.findFirst();
    expect(row?.toEmail).toBe("student@example.com");
    expect(row?.status).toBe("queued_no_smtp");
  });
});
