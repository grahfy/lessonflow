import { beforeEach, describe, expect, it } from "vitest";

import {
  sendCustomerBookingMovedEmail,
  sendCustomerBookingStatusEmail,
  sendCustomerCustomEmail,
  sendCustomerReminderEmail
} from "@/lib/booking-events";
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

  it("queues move update emails", async () => {
    await sendCustomerBookingMovedEmail({
      email: "student@example.com",
      name: "Student",
      oldWhen: new Date("2026-05-03T09:00:00.000Z"),
      newWhen: new Date("2026-05-03T10:00:00.000Z")
    });

    const row = await prisma.outboundEmail.findFirst({
      where: {
        subject: {
          contains: "updated"
        }
      }
    });
    expect(row?.status).toBe("queued_no_smtp");
  });

  it("queues reminder and custom emails", async () => {
    await sendCustomerReminderEmail({
      email: "student@example.com",
      name: "Student",
      when: new Date("2026-05-03T09:00:00.000Z")
    });
    await sendCustomerCustomEmail({
      email: "student@example.com",
      name: "Student",
      subject: "Custom note",
      message: "Bring your guitar."
    });

    const rows = await prisma.outboundEmail.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(rows.length).toBe(2);
    expect(rows[0]?.subject).toContain("reminder");
    expect(rows[1]?.subject).toContain("Custom note");
  });
});
