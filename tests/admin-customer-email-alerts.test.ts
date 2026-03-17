import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListUnreadInboxMessages,
  mockGetMessageDetails,
  mockListUnreadImapMessages,
  mockGetImapConnectionStatus
} = vi.hoisted(() => ({
  mockListUnreadInboxMessages: vi.fn(),
  mockGetMessageDetails: vi.fn(),
  mockListUnreadImapMessages: vi.fn(),
  mockGetImapConnectionStatus: vi.fn()
}));

vi.mock("@/lib/gmail/service", () => ({
  listUnreadInboxMessages: mockListUnreadInboxMessages,
  getMessageDetails: mockGetMessageDetails
}));

vi.mock("@/lib/imap/service", () => ({
  listUnreadImapMessages: mockListUnreadImapMessages,
  getImapConnectionStatus: mockGetImapConnectionStatus
}));

vi.mock("@/lib/observability", () => ({
  logEvent: vi.fn(),
  logError: vi.fn()
}));

import { GET as getAlerts } from "@/app/api/admin/customer-email-alerts/route";
import { GET as getAlertStatus } from "@/app/api/admin/customer-email-alerts/status/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function requestWithToken(token: string, url = "http://localhost/api/admin/customer-email-alerts") {
  return new NextRequest(url, {
    headers: {
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-customer-email-alerts", () => {
  beforeEach(async () => {
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();

    vi.clearAllMocks();
    vi.stubEnv("ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED", "true");
    vi.stubEnv("ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER", "auto");
    vi.stubEnv("GMAIL_CLIENT_ID", "client-id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("GMAIL_USER_EMAIL", "owner@example.com");
    vi.stubEnv("IMAP_HOST", "");
    vi.stubEnv("IMAP_PORT", "993");
    vi.stubEnv("IMAP_USER", "");
    vi.stubEnv("IMAP_PASS", "");
    vi.stubEnv("IMAP_TLS", "true");
    vi.stubEnv("IMAP_MAILBOX", "INBOX");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns matching unread customer emails for the owner via gmail", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const alex = await prisma.customer.create({
      data: {
        fullName: "Alex Student",
        normalizedFullName: "alex student",
        email: "alex@example.com",
        phone: "0400000001",
        normalizedEmail: "alex@example.com",
        normalizedPhone: "0400000001",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const beth = await prisma.customer.create({
      data: {
        fullName: "Beth Student",
        normalizedFullName: "beth student",
        email: "beth@example.com",
        phone: "0400000002",
        normalizedEmail: "beth@example.com",
        normalizedPhone: "0400000002",
        skillLevel: "intermediate",
        lessonMode: "video"
      }
    });

    mockListUnreadInboxMessages.mockResolvedValue({
      messages: [{ id: "msg-1" }, { id: "msg-2" }, { id: "msg-3" }]
    });

    mockGetMessageDetails.mockImplementation(async (messageId: string) => {
      const messages = {
        "msg-1": {
          id: "msg-1",
          snippet: "Can we move this week's lesson?",
          internalDate: "1712285100000",
          payload: {
            headers: [
              { name: "From", value: "Alex Student <alex@example.com>" },
              { name: "Subject", value: "Lesson question" },
              { name: "Date", value: "Fri, 05 Apr 2026 09:45:00 +1100" }
            ]
          }
        },
        "msg-2": {
          id: "msg-2",
          snippet: "I have sent the transfer receipt.",
          internalDate: "1712288700000",
          payload: {
            headers: [
              { name: "From", value: "Beth Student <beth@example.com>" },
              { name: "Subject", value: "Payment receipt" },
              { name: "Date", value: "Fri, 05 Apr 2026 10:45:00 +1100" }
            ]
          }
        },
        "msg-3": {
          id: "msg-3",
          snippet: "Spam that should not match a customer.",
          internalDate: "1712292300000",
          payload: {
            headers: [
              { name: "From", value: "Unknown Sender <nobody@example.net>" },
              { name: "Subject", value: "Advertisement" },
              { name: "Date", value: "Fri, 05 Apr 2026 11:45:00 +1100" }
            ]
          }
        }
      } as const;

      return messages[messageId as keyof typeof messages];
    });

    const response = await getAlerts(requestWithToken(token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      state: string;
      provider: string | null;
      unreadCount: number;
      matchedCustomers: Array<{ id: string; messageCount: number }>;
      messages: Array<{ customerId: string; senderEmail: string; subject: string }>;
    };

    expect(body.state).toBe("ready");
    expect(body.provider).toBe("gmail");
    expect(body.unreadCount).toBe(2);
    expect(body.matchedCustomers).toHaveLength(2);
    expect(body.matchedCustomers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: alex.id, messageCount: 1 }),
        expect.objectContaining({ id: beth.id, messageCount: 1 })
      ])
    );
    expect(body.messages).toEqual([
      expect.objectContaining({ customerId: beth.id, senderEmail: "beth@example.com", subject: "Payment receipt" }),
      expect.objectContaining({ customerId: alex.id, senderEmail: "alex@example.com", subject: "Lesson question" })
    ]);
    expect(mockListUnreadImapMessages).not.toHaveBeenCalled();
  });

  it("falls back to imap when provider is auto and gmail is unavailable", async () => {
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REFRESH_TOKEN;
    delete process.env.GMAIL_USER_EMAIL;
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("IMAP_USER", "owner@example.com");
    vi.stubEnv("IMAP_PASS", "imap-pass");

    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const alex = await prisma.customer.create({
      data: {
        fullName: "Alex Student",
        normalizedFullName: "alex student",
        email: "alex@example.com",
        phone: "0400000001",
        normalizedEmail: "alex@example.com",
        normalizedPhone: "0400000001",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    mockListUnreadImapMessages.mockResolvedValue([
      {
        messageId: "imap-1",
        senderEmail: "alex@example.com",
        subject: "Reschedule",
        snippet: "Could we move to Thursday?",
        receivedAt: "2026-04-05T00:15:00.000Z"
      }
    ]);

    const response = await getAlerts(requestWithToken(token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      provider: string | null;
      unreadCount: number;
      messages: Array<{ customerId: string; subject: string }>;
    };

    expect(body.provider).toBe("imap");
    expect(body.unreadCount).toBe(1);
    expect(body.messages).toEqual([
      expect.objectContaining({ customerId: alex.id, subject: "Reschedule" })
    ]);
    expect(mockListUnreadInboxMessages).not.toHaveBeenCalled();
  });

  it("falls back to imap when gmail fails at runtime in auto mode", async () => {
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("IMAP_USER", "owner@example.com");
    vi.stubEnv("IMAP_PASS", "imap-pass");

    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const alex = await prisma.customer.create({
      data: {
        fullName: "Alex Student",
        normalizedFullName: "alex student",
        email: "alex@example.com",
        phone: "0400000001",
        normalizedEmail: "alex@example.com",
        normalizedPhone: "0400000001",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    mockListUnreadInboxMessages.mockRejectedValue(new Error("Gmail token expired"));
    mockListUnreadImapMessages.mockResolvedValue([
      {
        messageId: "imap-1",
        senderEmail: "alex@example.com",
        subject: "Need to reschedule",
        snippet: "Thursday instead?",
        receivedAt: "2026-04-05T00:15:00.000Z"
      }
    ]);

    const response = await getAlerts(requestWithToken(token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      provider: string | null;
      unreadCount: number;
      messages: Array<{ customerId: string; subject: string }>;
    };

    expect(body.provider).toBe("imap");
    expect(body.unreadCount).toBe(1);
    expect(body.messages).toEqual([
      expect.objectContaining({ customerId: alex.id, subject: "Need to reschedule" })
    ]);
    expect(mockListUnreadInboxMessages).toHaveBeenCalledTimes(1);
    expect(mockListUnreadImapMessages).toHaveBeenCalledTimes(1);
  });

  it("uses imap when explicitly requested", async () => {
    vi.stubEnv("ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER", "imap");
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("IMAP_USER", "owner@example.com");
    vi.stubEnv("IMAP_PASS", "imap-pass");

    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    mockListUnreadImapMessages.mockResolvedValue([]);

    const response = await getAlerts(requestWithToken(token));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { provider: string | null; unreadCount: number };
    expect(body).toMatchObject({ provider: "imap", unreadCount: 0 });
    expect(mockListUnreadImapMessages).toHaveBeenCalled();
    expect(mockListUnreadInboxMessages).not.toHaveBeenCalled();
  });

  it("does not fall back to imap when gmail is explicitly selected", async () => {
    vi.stubEnv("ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER", "gmail");
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("IMAP_USER", "owner@example.com");
    vi.stubEnv("IMAP_PASS", "imap-pass");

    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    mockListUnreadInboxMessages.mockRejectedValue(new Error("Gmail token expired"));

    const response = await getAlerts(requestWithToken(token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { state: string; provider: string | null; unreadCount: number };
    expect(body).toMatchObject({ state: "ready", provider: "gmail", unreadCount: 0 });
    expect(mockListUnreadInboxMessages).toHaveBeenCalledTimes(1);
    expect(mockListUnreadImapMessages).not.toHaveBeenCalled();
  });

  it("returns disabled state without hitting providers when the feature toggle is off", async () => {
    vi.stubEnv("ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED", "false");
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const response = await getAlerts(requestWithToken(token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { state: string; unreadCount: number; provider: string | null };
    expect(body).toMatchObject({ state: "disabled", unreadCount: 0, provider: null });
    expect(mockListUnreadInboxMessages).not.toHaveBeenCalled();
    expect(mockListUnreadImapMessages).not.toHaveBeenCalled();
  });

  it("returns not_configured state when the selected provider is unavailable", async () => {
    vi.stubEnv("ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER", "imap");
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const response = await getAlerts(requestWithToken(token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { state: string; unreadCount: number; provider: string | null };
    expect(body).toMatchObject({ state: "not_configured", unreadCount: 0, provider: null });
  });

  it("returns provider status for gmail and imap", async () => {
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("IMAP_USER", "owner@example.com");
    vi.stubEnv("IMAP_PASS", "imap-pass");

    mockListUnreadInboxMessages.mockResolvedValue({ messages: [{ id: "gmail-1" }] });
    mockGetMessageDetails.mockResolvedValue({
      id: "gmail-1",
      snippet: "Hello",
      internalDate: "1712285100000",
      payload: {
        headers: [
          { name: "From", value: "Alex Student <alex@example.com>" },
          { name: "Subject", value: "Lesson question" },
          { name: "Date", value: "Fri, 05 Apr 2026 09:45:00 +1100" }
        ]
      }
    });
    mockGetImapConnectionStatus.mockResolvedValue({
      user: "owner@example.com",
      mailbox: "INBOX"
    });

    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const response = await getAlertStatus(
      requestWithToken(token, "http://localhost/api/admin/customer-email-alerts/status")
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      alertsEnabled: boolean;
      providerPreference: string;
      activeProvider: string | null;
      gmail: { status: string };
      imap: { status: string; mailbox?: string };
    };

    expect(body.alertsEnabled).toBe(true);
    expect(body.providerPreference).toBe("auto");
    expect(body.activeProvider).toBe("gmail");
    expect(body.gmail.status).toBe("connected");
    expect(body.imap).toMatchObject({ status: "connected", mailbox: "INBOX" });
  });

  it("reports imap as active when gmail fails in auto mode", async () => {
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("IMAP_USER", "owner@example.com");
    vi.stubEnv("IMAP_PASS", "imap-pass");

    mockListUnreadInboxMessages.mockRejectedValue(new Error("Gmail token expired"));
    mockGetImapConnectionStatus.mockResolvedValue({
      user: "owner@example.com",
      mailbox: "INBOX"
    });

    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const response = await getAlertStatus(
      requestWithToken(token, "http://localhost/api/admin/customer-email-alerts/status")
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      activeProvider: string | null;
      gmail: { status: string };
      imap: { status: string };
    };

    expect(body.activeProvider).toBe("imap");
    expect(body.gmail.status).toBe("error");
    expect(body.imap.status).toBe("connected");
  });

  it("rejects teacher access to owner-only alert routes", async () => {
    await ensureOwnerAdmin();
    const teacher = await prisma.adminUser.create({
      data: {
        email: "teacher-alerts@example.com",
        role: "teacher",
        firstName: "Teacher",
        displayName: "Teacher Alerts",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });

    const token = createSessionToken(teacher.email);

    const alertsResponse = await getAlerts(requestWithToken(token));
    const statusResponse = await getAlertStatus(
      requestWithToken(token, "http://localhost/api/admin/customer-email-alerts/status")
    );

    expect(alertsResponse.status).toBe(403);
    expect(statusResponse.status).toBe(403);
  });
});
