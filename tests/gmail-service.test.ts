import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGmailSend = vi.fn();
const mockOutboundEmailCreate = vi.fn();
const mockSystemLogCreate = vi.fn(() => Promise.resolve());

vi.mock("@/lib/gmail/client", () => ({
  getGmailClient: () => ({
    users: {
      messages: {
        send: mockGmailSend
      }
    }
  })
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

describe("gmail-service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("GMAIL_CLIENT_ID", "client-id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("GMAIL_USER_EMAIL", "lessonflow@gmail.com");
    mockOutboundEmailCreate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("still returns sent when gmail delivery succeeds but audit persistence fails", async () => {
    mockGmailSend.mockResolvedValue({
      data: {
        id: "gmail-message-id"
      }
    });
    mockOutboundEmailCreate.mockRejectedValueOnce(new Error("audit insert failed"));

    const { sendGmailEmail } = await import("@/lib/email/gmail-service");
    const result = await sendGmailEmail({
      to: "student@example.com",
      subject: "Lesson reminder",
      html: "<p>Hello</p>"
    });

    expect(result).toEqual({ status: "sent" });
    expect(mockGmailSend).toHaveBeenCalledTimes(1);
    expect(mockOutboundEmailCreate).toHaveBeenCalledTimes(1);
  });
});
