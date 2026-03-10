import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/admin/customers/[id]/email/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";

describe("admin-customer-email", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
    await prisma.customer.deleteMany();
    vi.stubEnv("NODE_ENV", "production");
  });

  it("requires a captcha token and answer in production (simulated)", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookieName = getSessionCookieName();

    const customer = await prisma.customer.create({
      data: {
        firstName: "Test",
        lastName: "Student",
        fullName: "Test Student",
        normalizedFullName: "test student",
        email: "test@example.com",
        normalizedEmail: "test@example.com",
        phone: "1234567890",
        normalizedPhone: "1234567890"
      }
    });

    const body = {
      subject: "Test Subject",
      message: "Test Message"
      // captchaToken and captchaAnswer are missing
    };

    const req = new NextRequest(`http://localhost/api/admin/customers/${customer.id}/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${cookieName}=${token}`
      },
      body: JSON.stringify(body)
    });

    const res = await POST(req, { params: Promise.resolve({ id: customer.id }) });
    
    // This test is expected to FAIL until we implement the captcha check in the route.
    // Actually, I'll make it expect 400 once I'm in the Green phase.
    // For Red phase, it will return 200 (current behavior).
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("CAPTCHA");
  });
});
