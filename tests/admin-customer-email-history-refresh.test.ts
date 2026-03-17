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

import { POST } from "@/app/api/admin/customers/[id]/email/refresh/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function authRequest(url: string, token: string) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-customer-email-history-refresh", () => {
  beforeEach(async () => {
    await prisma.customerInboundEmail.deleteMany();
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

  it("allows a teacher to refresh history for an assigned customer", async () => {
    await ensureOwnerAdmin();
    const teacher = await prisma.adminUser.create({
      data: {
        email: "teacher-history@example.com",
        role: "teacher",
        firstName: "Teacher",
        displayName: "Teacher History",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });
    const token = createSessionToken(teacher.email);

    const customer = await prisma.customer.create({
      data: {
        fullName: "Alex Student",
        normalizedFullName: "alex student",
        email: "alex@example.com",
        phone: "0400000001",
        normalizedEmail: "alex@example.com",
        normalizedPhone: "0400000001",
        skillLevel: "beginner",
        lessonMode: "in_person",
        primaryTeacherId: teacher.id
      }
    });

    mockSyncGmailSentMessages.mockResolvedValue({
      importedCount: 2,
      skippedCount: 1
    });
    mockListRecentImapMessagesBySender.mockResolvedValue([
      {
        messageId: "imap-1",
        senderEmail: "alex@example.com",
        toEmail: "owner@example.com",
        subject: "Can we reschedule?",
        snippet: "Can we reschedule?",
        bodyText: "Can we reschedule next week?",
        receivedAt: "2026-03-18T11:00:00.000Z"
      }
    ]);

    const response = await POST(
      authRequest(`http://localhost/api/admin/customers/${customer.id}/email/refresh`, token),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      gmail?: { importedCount: number; skippedCount: number };
      imap?: { importedCount: number; skippedCount: number };
    };

    expect(body.ok).toBe(true);
    expect(body.gmail).toEqual({ importedCount: 2, skippedCount: 1 });
    expect(body.imap).toEqual({ importedCount: 1, skippedCount: 0 });
    expect(mockSyncGmailSentMessages).toHaveBeenCalledWith(20, { targetToEmail: "alex@example.com" });
    expect(mockListRecentImapMessagesBySender).toHaveBeenCalledWith("alex@example.com", 20);

    const inboundRows = await prisma.customerInboundEmail.findMany({
      orderBy: {
        receivedAt: "desc"
      }
    });
    expect(inboundRows).toHaveLength(1);
    expect(inboundRows[0]).toMatchObject({
      customerId: customer.id,
      provider: "imap",
      source: "imap",
      fromEmail: "alex@example.com",
      subject: "Can we reschedule?"
    });
  });

  it("continues with IMAP history refresh when Gmail sync fails", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const customer = await prisma.customer.create({
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

    mockSyncGmailSentMessages.mockRejectedValue(new Error("gmail token expired"));
    mockListRecentImapMessagesBySender.mockResolvedValue([
      {
        messageId: "imap-history-1",
        senderEmail: "alex@example.com",
        toEmail: "owner@example.com",
        subject: "Already seen reply",
        snippet: "Following up on my lesson",
        bodyText: "Following up on my lesson",
        receivedAt: "2026-03-18T12:00:00.000Z"
      }
    ]);

    const response = await POST(
      authRequest(`http://localhost/api/admin/customers/${customer.id}/email/refresh`, token),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      gmail?: { importedCount: number; skippedCount: number };
      imap?: { importedCount: number; skippedCount: number };
    };

    expect(body.ok).toBe(true);
    expect(body.gmail).toBeUndefined();
    expect(body.imap).toEqual({ importedCount: 1, skippedCount: 0 });

    const inboundRows = await prisma.customerInboundEmail.findMany();
    expect(inboundRows).toHaveLength(1);
    expect(inboundRows[0]?.externalId).toBe("imap-history-1");
  });

  it("persists the same inbound IMAP message for multiple customers who share an email account", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const [customerA, customerB] = await Promise.all([
      prisma.customer.create({
        data: {
          fullName: "Taylor Sibling",
          normalizedFullName: "taylor sibling",
          email: "family@example.com",
          phone: "0400000101",
          normalizedEmail: "family@example.com",
          normalizedPhone: "0400000101",
          skillLevel: "beginner",
          lessonMode: "in_person"
        }
      }),
      prisma.customer.create({
        data: {
          fullName: "Jordan Sibling",
          normalizedFullName: "jordan sibling",
          email: "family@example.com",
          phone: "0400000102",
          normalizedEmail: "family@example.com",
          normalizedPhone: "0400000102",
          skillLevel: "beginner",
          lessonMode: "in_person"
        }
      })
    ]);

    mockSyncGmailSentMessages.mockResolvedValue({
      importedCount: 0,
      skippedCount: 0
    });
    mockListRecentImapMessagesBySender.mockResolvedValue([
      {
        messageId: "imap-family-1",
        senderEmail: "family@example.com",
        toEmail: "owner@example.com",
        subject: "Shared inbox reply",
        snippet: "One family inbox",
        bodyText: "One family inbox",
        receivedAt: "2026-03-18T09:00:00.000Z"
      }
    ]);

    const responseA = await POST(
      authRequest(`http://localhost/api/admin/customers/${customerA.id}/email/refresh`, token),
      { params: Promise.resolve({ id: customerA.id }) }
    );
    const responseB = await POST(
      authRequest(`http://localhost/api/admin/customers/${customerB.id}/email/refresh`, token),
      { params: Promise.resolve({ id: customerB.id }) }
    );

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const inboundRows = await prisma.customerInboundEmail.findMany({
      where: {
        externalId: "imap-family-1"
      },
      orderBy: {
        customerId: "asc"
      }
    });

    expect(inboundRows).toHaveLength(2);
    expect(inboundRows.map((row) => row.customerId)).toEqual([customerA.id, customerB.id].sort());
  });

  it("forbids a teacher from refreshing another teacher's customer history", async () => {
    await ensureOwnerAdmin();
    const teacherA = await prisma.adminUser.create({
      data: {
        email: "teacher-a-history@example.com",
        role: "teacher",
        firstName: "Teacher",
        displayName: "Teacher A",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });
    const teacherB = await prisma.adminUser.create({
      data: {
        email: "teacher-b-history@example.com",
        role: "teacher",
        firstName: "Teacher",
        displayName: "Teacher B",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });

    const customer = await prisma.customer.create({
      data: {
        fullName: "Other Student",
        normalizedFullName: "other student",
        email: "other.student@example.com",
        phone: "0400000002",
        normalizedEmail: "other.student@example.com",
        normalizedPhone: "0400000002",
        skillLevel: "intermediate",
        lessonMode: "video",
        primaryTeacherId: teacherA.id
      }
    });

    const response = await POST(
      authRequest(
        `http://localhost/api/admin/customers/${customer.id}/email/refresh`,
        createSessionToken(teacherB.email)
      ),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(403);
    expect(mockSyncGmailSentMessages).not.toHaveBeenCalled();
    expect(mockListRecentImapMessagesBySender).not.toHaveBeenCalled();
  });
});
