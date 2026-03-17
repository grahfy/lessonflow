import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as runDailyDigestJob } from "@/app/api/jobs/daily-bookings-digest/route";
import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as emailService from "@/lib/email/service";

function jobRequest(secret?: string) {
  const headers = new Headers();
  if (secret) {
    headers.set("x-cron-secret", secret);
  }

  return new NextRequest("http://localhost/api/jobs/daily-bookings-digest", {
    method: "POST",
    headers
  });
}

describe("jobs-daily-bookings-digest", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
    await ensureOwnerAdmin();
  });

  it("rejects requests with missing or invalid cron secret", async () => {
    const noSecretRes = await runDailyDigestJob(jobRequest());
    expect(noSecretRes.status).toBe(401);

    const badSecretRes = await runDailyDigestJob(jobRequest("wrong-secret"));
    expect(badSecretRes.status).toBe(401);
  });

  it("returns delivery failure when the digest email cannot be sent", async () => {
    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const res = await runDailyDigestJob(jobRequest(process.env.CRON_SECRET || "test-cron-secret"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("smtp offline");
  });

  it("returns unavailable when no live email provider is configured", async () => {
    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({
      status: "queued_no_smtp"
    });

    const res = await runDailyDigestJob(jobRequest(process.env.CRON_SECRET || "test-cron-secret"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("no email provider");
  });

  it("excludes cancelled bookings from the digest payload", async () => {
    await prisma.booking.createMany({
      data: [
        {
          name: "Live Lesson",
          email: "live@example.com",
          phone: "0400000001",
          address: "1 Main Street",
          houseNumber: "1",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
          lessonMode: "in_person",
          skillLevel: "beginner",
          lessonDuration: "min30",
          startAt: new Date(),
          endAt: new Date(),
          timezone: "Australia/Melbourne",
          status: "approved"
        },
        {
          name: "Cancelled Lesson",
          email: "cancelled@example.com",
          phone: "0400000002",
          address: "2 Main Street",
          houseNumber: "2",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
          lessonMode: "video",
          skillLevel: "beginner",
          lessonDuration: "min60",
          startAt: new Date(),
          endAt: new Date(),
          timezone: "Australia/Melbourne",
          status: "cancelled"
        }
      ]
    });

    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({
      status: "sent"
    });

    const res = await runDailyDigestJob(jobRequest(process.env.CRON_SECRET || "test-cron-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; count?: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const html = String(sendSpy.mock.calls[0]?.[0].html ?? "");
    expect(html).toContain("Live Lesson");
    expect(html).not.toContain("Cancelled Lesson");
  });
});
