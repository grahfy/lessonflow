import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/admin/customers/[id]/email/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import * as emailService from "@/lib/email/service";

const MOCK_VALID_TOKEN = "valid-token";
const MOCK_VALID_ANSWER = "123456";

vi.mock("@/lib/captcha", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/captcha")>();
  return {
    ...actual,
    verifyCaptchaSubmission: vi.fn((input: { captchaToken?: string; captchaAnswer?: string }) => {
      if (input.captchaToken === MOCK_VALID_TOKEN && input.captchaAnswer === MOCK_VALID_ANSWER) {
        return { ok: true };
      }
      return { ok: false, code: "INVALID", message: "CAPTCHA answer was incorrect." };
    }),
  };
});

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
      message: "Test Message",
      captchaToken: "wrong-token",
      captchaAnswer: "wrong-answer"
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
    
    // NOTE: Production mode should reject the send before any outbound row is
    // recorded when the captcha challenge is invalid.
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("CAPTCHA");
  });

  it("returns a configuration error when no live email provider is available in production", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookieName = getSessionCookieName();

    const customer = await prisma.customer.create({
      data: {
        firstName: "Test",
        lastName: "Student",
        fullName: "Test Student",
        normalizedFullName: "test student",
        email: "success@example.com",
        normalizedEmail: "success@example.com",
        phone: "1234567890",
        normalizedPhone: "1234567890"
      }
    });

    const body = {
      subject: "Test Subject",
      message: "Test Message",
      captchaToken: MOCK_VALID_TOKEN,
      captchaAnswer: MOCK_VALID_ANSWER
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
    
    expect(res.status).toBe(503);
    const data = await res.json() as { error?: string };
    expect(data.error).toContain("not configured");

    const outbound = await prisma.outboundEmail.findFirstOrThrow({
      where: {
        toEmail: "success@example.com"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(outbound.subject).toBe("Test Subject");
    expect(outbound.status).toBe("queued_no_smtp");
    expect(outbound.htmlBody).toContain("Test Message");
  });

  it("returns a delivery error when the email transport reports failure", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookieName = getSessionCookieName();

    const customer = await prisma.customer.create({
      data: {
        firstName: "Failure",
        lastName: "Student",
        fullName: "Failure Student",
        normalizedFullName: "failure student",
        email: "failure@example.com",
        normalizedEmail: "failure@example.com",
        phone: "1234567890",
        normalizedPhone: "1234567890"
      }
    });

    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const req = new NextRequest(`http://localhost/api/admin/customers/${customer.id}/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${cookieName}=${token}`
      },
      body: JSON.stringify({
        subject: "Test Subject",
        message: "Test Message",
        captchaToken: MOCK_VALID_TOKEN,
        captchaAnswer: MOCK_VALID_ANSWER
      })
    });

    const res = await POST(req, { params: Promise.resolve({ id: customer.id }) });
    expect(res.status).toBe(502);
    const data = await res.json() as { error?: string };
    expect(data.error).toContain("smtp offline");
  });
});
