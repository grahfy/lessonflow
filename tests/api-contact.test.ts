import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/contact/route";
import { DEFAULT_GEOBLOCKING_SETTINGS_ID, PUBLIC_GEOBLOCKED_MESSAGE } from "@/lib/geoblocking-settings";

describe("api-contact", () => {
  beforeEach(async () => {
    // Route tests run against a real Prisma DB, so clear persisted rows to keep
    // assertions focused on the current request/response contract.
    await prisma.outboundEmail.deleteMany();
    await prisma.contactSubmission.deleteMany();
    await prisma.geoblockingSettings.deleteMany();
  });

  it("returns partial success when message is saved but email delivery is unavailable", async () => {
    // The contract stores the contact submission first and reports partial success when
    // owner notification delivery is degraded.
    const request = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jordan",
        email: "jordan@example.com",
        phone: "0400000000",
        message: "I want to book beginner lessons next week.",
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(202);

    const payload = (await response.json()) as {
      ok?: boolean;
      partial?: boolean;
      warning?: string;
      deliveryStatus?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.partial).toBe(true);
    expect(typeof payload.warning).toBe("string");
    expect(payload.deliveryStatus).toBe("queued_no_smtp");

    const row = await prisma.contactSubmission.findFirst();
    expect(row?.email).toBe("jordan@example.com");
  });

  it("stores contact messages up to the public form limit", async () => {
    const message = "A".repeat(2000);
    const request = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jordan",
        email: "jordan.long@example.com",
        phone: "0400000000",
        message,
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(202);

    const row = await prisma.contactSubmission.findFirst({
      where: { email: "jordan.long@example.com" }
    });
    expect(row?.message).toBe(message);
  });

  it("rejects blocked-country contact submissions", async () => {
    await prisma.geoblockingSettings.create({
      data: {
        id: DEFAULT_GEOBLOCKING_SETTINGS_ID,
        allowedCountries: ["AU"],
        unknownCountryMode: "allow"
      }
    });

    const request = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vercel-ip-country": "US"
      },
      body: JSON.stringify({
        name: "Jordan",
        email: "jordan@example.com",
        phone: "0400000000",
        message: "I want to book beginner lessons next week.",
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe(PUBLIC_GEOBLOCKED_MESSAGE);
    expect(await prisma.contactSubmission.count()).toBe(0);
  });

  it("rejects unknown-country contact submissions when fallback policy is block", async () => {
    await prisma.geoblockingSettings.create({
      data: {
        id: DEFAULT_GEOBLOCKING_SETTINGS_ID,
        allowedCountries: ["AU"],
        unknownCountryMode: "block"
      }
    });

    const request = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Jordan",
        email: "jordan@example.com",
        phone: "0400000000",
        message: "I want to book beginner lessons next week.",
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe(PUBLIC_GEOBLOCKED_MESSAGE);
  });
});
