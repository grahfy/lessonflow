import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSyncGmailSentMessages, mockListRecentImapMessagesBySender } = vi.hoisted(() => ({
  mockSyncGmailSentMessages: vi.fn(),
  mockListRecentImapMessagesBySender: vi.fn()
}));

vi.mock("@/lib/gmail/sync", () => ({
  syncGmailSentMessages: mockSyncGmailSentMessages
}));

vi.mock("@/lib/imap/service", () => ({
  listRecentImapMessagesBySender: mockListRecentImapMessagesBySender
}));

import { GET as getEmailHistory } from "@/app/api/admin/email-history/route";
import { POST as refreshEmailHistory } from "@/app/api/admin/email-history/refresh/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function authGet(url: string, token: string) {
  return new NextRequest(url, {
    headers: {
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

function authPost(url: string, token: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-email-history-route", () => {
  beforeEach(async () => {
    await prisma.customerInboundEmail.deleteMany();
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();

    vi.clearAllMocks();
    vi.stubEnv("GMAIL_CLIENT_ID", "client-id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("GMAIL_USER_EMAIL", "owner@example.com");
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("IMAP_PORT", "993");
    vi.stubEnv("IMAP_USER", "owner@example.com");
    vi.stubEnv("IMAP_PASS", "imap-pass");
    vi.stubEnv("IMAP_TLS", "true");
    vi.stubEnv("IMAP_MAILBOX", "INBOX");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads history for an unlinked booking request by its email address", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        name: "Taylor Student",
        email: "taylor@example.com",
        phone: "0400009999",
        address: "10 Main Street",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-03-18T08:00:00.000Z"),
        assignedTeacherId: owner.id
      }
    });

    await prisma.outboundEmail.create({
      data: {
        toEmail: "Taylor Student <taylor@example.com>",
        subject: "Request follow-up",
        htmlBody: "<p>Sent from Gmail</p>",
        status: "sent",
        provider: "gmail",
        source: "gmail",
        externalId: "gmail-request-1",
        createdAt: new Date("2026-03-18T09:00:00.000Z")
      }
    });

    const response = await getEmailHistory(
      authGet(`http://localhost/api/admin/email-history?bookingRequestId=${bookingRequest.id}`, token)
    );
    const body = (await response.json()) as { history: Array<{ subject: string; htmlBody?: string }> };

    expect(response.status).toBe(200);
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      subject: "Request follow-up",
      htmlBody: "<p>Sent from Gmail</p>"
    });
  });

  it("refreshes booking-request history through the generic route instead of a missing customer path", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        name: "Jordan Student",
        email: "jordan@example.com",
        phone: "0400008888",
        address: "12 Main Street",
        houseNumber: "12",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-03-18T08:00:00.000Z"),
        assignedTeacherId: owner.id
      }
    });

    mockSyncGmailSentMessages.mockResolvedValue({
      importedCount: 1,
      skippedCount: 0
    });
    mockListRecentImapMessagesBySender.mockResolvedValue([]);

    const response = await refreshEmailHistory(
      authPost("http://localhost/api/admin/email-history/refresh", token, {
        bookingRequestId: bookingRequest.id
      })
    );
    const body = (await response.json()) as {
      ok: boolean;
      gmail?: { importedCount: number; skippedCount: number };
      imap?: { importedCount: number; skippedCount: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.gmail).toEqual({ importedCount: 1, skippedCount: 0 });
    expect(body.imap).toBeUndefined();
    expect(mockSyncGmailSentMessages).toHaveBeenCalledWith(20, { targetToEmail: "jordan@example.com" });
  });

  it("limits same-email inbound history to the current teacher's authorized customers", async () => {
    await ensureOwnerAdmin();
    const [teacherA, teacherB] = await Promise.all([
      prisma.adminUser.create({
        data: {
          email: "teacher-a-history@example.com",
          role: "teacher",
          firstName: "Teacher",
          displayName: "Teacher A",
          passwordHash: await bcrypt.hash("teacher-a-password", 12),
          isActive: true
        }
      }),
      prisma.adminUser.create({
        data: {
          email: "teacher-b-history@example.com",
          role: "teacher",
          firstName: "Teacher",
          displayName: "Teacher B",
          passwordHash: await bcrypt.hash("teacher-b-password", 12),
          isActive: true
        }
      })
    ]);
    const token = createSessionToken(teacherA.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        name: "Shared Email Request",
        email: "shared@example.com",
        phone: "0400001234",
        address: "14 Main Street",
        houseNumber: "14",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-03-18T08:00:00.000Z"),
        assignedTeacherId: teacherA.id
      }
    });

    const [customerA, customerB] = await Promise.all([
      prisma.customer.create({
        data: {
          fullName: "Shared Teacher A",
          normalizedFullName: "shared teacher a",
          email: "shared@example.com",
          normalizedEmail: "shared@example.com",
          phone: "0400002222",
          normalizedPhone: "0400002222",
          skillLevel: "beginner",
          lessonMode: "in_person",
          primaryTeacherId: teacherA.id
        }
      }),
      prisma.customer.create({
        data: {
          fullName: "Shared Teacher B",
          normalizedFullName: "shared teacher b",
          email: "shared@example.com",
          normalizedEmail: "shared@example.com",
          phone: "0400003333",
          normalizedPhone: "0400003333",
          skillLevel: "beginner",
          lessonMode: "in_person",
          primaryTeacherId: teacherB.id
        }
      })
    ]);

    await prisma.customerInboundEmail.createMany({
      data: [
        {
          customerId: customerA.id,
          provider: "imap",
          source: "imap",
          externalId: "imap-shared-a",
          fromEmail: "shared@example.com",
          toEmail: "owner@example.com",
          subject: "Teacher A thread",
          snippet: "Teacher A thread",
          bodyText: "Teacher A thread",
          status: "received",
          receivedAt: new Date("2026-03-18T09:00:00.000Z")
        },
        {
          customerId: customerB.id,
          provider: "imap",
          source: "imap",
          externalId: "imap-shared-b",
          fromEmail: "shared@example.com",
          toEmail: "owner@example.com",
          subject: "Teacher B thread",
          snippet: "Teacher B thread",
          bodyText: "Teacher B thread",
          status: "received",
          receivedAt: new Date("2026-03-18T10:00:00.000Z")
        }
      ]
    });

    const response = await getEmailHistory(
      authGet(`http://localhost/api/admin/email-history?bookingRequestId=${bookingRequest.id}`, token)
    );
    const body = (await response.json()) as { history: Array<{ subject: string; direction: string }> };

    expect(response.status).toBe(200);
    expect(body.history.filter((item) => item.direction === "inbound")).toEqual([
      expect.objectContaining({ subject: "Teacher A thread", direction: "inbound" })
    ]);
  });

  it("refreshes same-email inbound history only for the current teacher's customers", async () => {
    await ensureOwnerAdmin();
    const [teacherA, teacherB] = await Promise.all([
      prisma.adminUser.create({
        data: {
          email: "teacher-a-refresh@example.com",
          role: "teacher",
          firstName: "Teacher",
          displayName: "Teacher A Refresh",
          passwordHash: await bcrypt.hash("teacher-a-refresh-password", 12),
          isActive: true
        }
      }),
      prisma.adminUser.create({
        data: {
          email: "teacher-b-refresh@example.com",
          role: "teacher",
          firstName: "Teacher",
          displayName: "Teacher B Refresh",
          passwordHash: await bcrypt.hash("teacher-b-refresh-password", 12),
          isActive: true
        }
      })
    ]);
    const token = createSessionToken(teacherA.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        name: "Shared Refresh Request",
        email: "shared-refresh@example.com",
        phone: "0400004444",
        address: "16 Main Street",
        houseNumber: "16",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-03-18T08:00:00.000Z"),
        assignedTeacherId: teacherA.id
      }
    });

    const [customerA, customerB] = await Promise.all([
      prisma.customer.create({
        data: {
          fullName: "Shared Refresh A",
          normalizedFullName: "shared refresh a",
          email: "shared-refresh@example.com",
          normalizedEmail: "shared-refresh@example.com",
          phone: "0400005555",
          normalizedPhone: "0400005555",
          skillLevel: "beginner",
          lessonMode: "in_person",
          primaryTeacherId: teacherA.id
        }
      }),
      prisma.customer.create({
        data: {
          fullName: "Shared Refresh B",
          normalizedFullName: "shared refresh b",
          email: "shared-refresh@example.com",
          normalizedEmail: "shared-refresh@example.com",
          phone: "0400006666",
          normalizedPhone: "0400006666",
          skillLevel: "beginner",
          lessonMode: "in_person",
          primaryTeacherId: teacherB.id
        }
      })
    ]);

    mockSyncGmailSentMessages.mockResolvedValue({
      importedCount: 1,
      skippedCount: 0
    });
    mockListRecentImapMessagesBySender.mockResolvedValue([
      {
        messageId: "imap-shared-refresh-1",
        senderEmail: "shared-refresh@example.com",
        toEmail: "owner@example.com",
        subject: "Shared refresh thread",
        snippet: "Shared refresh thread",
        bodyText: "Shared refresh thread",
        receivedAt: "2026-03-18T12:00:00.000Z"
      }
    ]);

    const response = await refreshEmailHistory(
      authPost("http://localhost/api/admin/email-history/refresh", token, {
        bookingRequestId: bookingRequest.id
      })
    );

    expect(response.status).toBe(200);

    const inboundRows = await prisma.customerInboundEmail.findMany({
      where: {
        externalId: "imap-shared-refresh-1"
      },
      orderBy: {
        customerId: "asc"
      }
    });

    expect(inboundRows).toHaveLength(1);
    expect(inboundRows[0]?.customerId).toBe(customerA.id);
    expect(inboundRows[0]?.customerId).not.toBe(customerB.id);
  });
});
