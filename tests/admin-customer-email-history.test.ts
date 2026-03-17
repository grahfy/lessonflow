import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/admin/customers/[id]/email/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function authRequest(url: string, token: string) {
  return new NextRequest(url, {
    headers: {
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-customer-email-history", () => {
  beforeEach(async () => {
    await prisma.customerInboundEmail.deleteMany();
    await prisma.outboundEmail.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("returns merged outbound and inbound customer email history newest first", async () => {
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

    await prisma.outboundEmail.createMany({
      data: [
        {
          toEmail: "Alex Student <alex@example.com>",
          subject: "Imported Gmail message",
          htmlBody: "<p>Sent from Gmail</p>",
          status: "sent",
          provider: "gmail",
          source: "gmail",
          externalId: "gmail-msg-1",
          createdAt: new Date("2026-03-18T10:00:00.000Z")
        },
        {
          toEmail: "alex@example.com",
          subject: "App follow-up",
          htmlBody: "<p>Sent from app</p>",
          status: "queued_no_smtp",
          provider: "smtp",
          source: "app",
          createdAt: new Date("2026-03-18T08:00:00.000Z")
        }
      ]
    });

    await prisma.customerInboundEmail.create({
      data: {
        customerId: customer.id,
        provider: "imap",
        source: "imap",
        externalId: "imap-msg-1",
        fromEmail: "alex@example.com",
        toEmail: "owner@example.com",
        subject: "Inbound reply",
        snippet: "Can we move to Thursday?",
        bodyText: "Can we move to Thursday?",
        status: "received",
        receivedAt: new Date("2026-03-18T11:00:00.000Z")
      }
    });

    const response = await GET(
      authRequest(`http://localhost/api/admin/customers/${customer.id}/email`, token),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      history: Array<{
        subject: string;
        direction: "inbound" | "outbound";
        provider?: string;
        source?: string;
        fromEmail: string;
      }>;
    };

    expect(body.history).toHaveLength(3);
    expect(body.history.map((email) => email.subject)).toEqual([
      "Inbound reply",
      "Imported Gmail message",
      "App follow-up"
    ]);
    expect(body.history[0]).toMatchObject({
      direction: "inbound",
      provider: "imap",
      source: "imap",
      fromEmail: "alex@example.com"
    });
    expect(body.history[1]).toMatchObject({
      direction: "outbound",
      provider: "gmail",
      source: "gmail"
    });
    expect(body.history[2]).toMatchObject({
      direction: "outbound",
      provider: "smtp",
      source: "app"
    });
  });

  it("matches customer history against any recipient in a stored Gmail recipient list", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const customer = await prisma.customer.create({
      data: {
        fullName: "Sam Student",
        normalizedFullName: "sam student",
        email: "sam@example.com",
        phone: "0400000003",
        normalizedEmail: "sam@example.com",
        normalizedPhone: "0400000003",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    await prisma.outboundEmail.create({
      data: {
        toEmail: "alex@example.com, sam@example.com",
        subject: "Group follow-up",
        htmlBody: "<p>Sent to multiple recipients</p>",
        status: "sent",
        provider: "gmail",
        source: "gmail",
        externalId: "gmail-msg-multi",
        createdAt: new Date("2026-03-18T09:00:00.000Z")
      }
    });

    const response = await GET(
      authRequest(`http://localhost/api/admin/customers/${customer.id}/email`, token),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      history: Array<{ subject: string; toEmail: string }>;
    };

    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      subject: "Group follow-up",
      toEmail: "alex@example.com, sam@example.com"
    });
  });
});
