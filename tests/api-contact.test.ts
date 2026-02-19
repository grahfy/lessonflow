import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/contact/route";

describe("api-contact", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
    await prisma.contactSubmission.deleteMany();
  });

  it("persists a valid contact message", async () => {
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
    expect(response.status).toBe(200);

    const row = await prisma.contactSubmission.findFirst();
    expect(row?.email).toBe("jordan@example.com");
  });
});
