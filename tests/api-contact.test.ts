import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/contact/route";

describe("api-contact", () => {
  beforeEach(async () => {
    // Route tests run against a real Prisma DB, so clear persisted rows to keep
    // assertions focused on the current request/response contract.
    await prisma.outboundEmail.deleteMany();
    await prisma.contactSubmission.deleteMany();
  });

  it("persists a valid contact message even when email delivery is unavailable", async () => {
    // The current contract intentionally stores the contact request first and
    // reports email delivery state separately (503 + queued_no_smtp) when SMTP
    // isn't configured. This protects lead capture even during mail outages.
    const request = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jordan",
        email: "jordan@example.com",
        phone: "0400000000",
        message: "I want to book beginner lessons next week."
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(503);

    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.deliveryStatus).toBe("queued_no_smtp");

    const row = await prisma.contactSubmission.findFirst();
    expect(row?.email).toBe("jordan@example.com");
  });
});
