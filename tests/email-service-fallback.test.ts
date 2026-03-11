import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({
  sendMail: mockSendMail
}));
const mockIsGmailConfigured = vi.fn();
const mockSendGmailEmail = vi.fn();
const mockOutboundEmailCreate = vi.fn();
const mockSystemLogCreate = vi.fn(() => Promise.resolve());

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mockCreateTransport
  }
}));

vi.mock("@/lib/email/gmail-service", () => ({
  isGmailConfigured: mockIsGmailConfigured,
  sendGmailEmail: mockSendGmailEmail
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: {
      create: mockOutboundEmailCreate
    },
    systemLog: {
      create: mockSystemLogCreate
    }
  }
}));

describe("email-service-fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "smtp-user");
    vi.stubEnv("SMTP_PASS", "smtp-pass");
    vi.stubEnv("SMTP_FROM", "Melbourne Guitar School <no-reply@example.com>");
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to smtp when gmail is preferred but not configured", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "gmail");
    mockIsGmailConfigured.mockReturnValue(false);
    mockSendMail.mockResolvedValue({ messageId: "smtp-message-id" });

    const { sendEmail } = await import("@/lib/email/service");
    const result = await sendEmail({
      to: "student@example.com",
      subject: "Portal password updated",
      html: "<p>Hello</p>"
    });

    // RATIONALE: Preferred-provider settings should degrade gracefully rather
    // than dropping mail when only the secondary transport is usable.
    expect(result).toEqual({ status: "sent" });
    expect(mockSendGmailEmail).not.toHaveBeenCalled();
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "student@example.com",
        bcc: ["owner@example.com"],
        subject: "Portal password updated"
      })
    );
    expect(mockOutboundEmailCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        toEmail: "student@example.com",
        provider: "smtp",
        status: "sent"
      })
    });
  });

  it("passes the owner bcc through when smtp fails and gmail takes over", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    mockIsGmailConfigured.mockReturnValue(true);
    mockSendMail.mockRejectedValue(new Error("SMTP blocked"));
    mockSendGmailEmail.mockResolvedValue({ status: "sent" });

    const { sendEmail } = await import("@/lib/email/service");
    const result = await sendEmail({
      to: "student@example.com",
      subject: "Portal password updated",
      html: "<p>Hello</p>"
    });

    // NOTE: The owner visibility contract should survive provider failover, not
    // disappear when SMTP hands off to Gmail.
    expect(result).toEqual({ status: "sent" });
    expect(mockSendGmailEmail).toHaveBeenCalledWith({
      to: "student@example.com",
      subject: "Portal password updated",
      html: "<p>Hello</p>",
      bcc: ["owner@example.com"]
    });
  });
});
