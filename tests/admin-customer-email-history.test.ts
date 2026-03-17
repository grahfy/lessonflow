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
        htmlBody?: string;
        textBody?: string;
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
      source: "gmail",
      htmlBody: "<p>Sent from Gmail</p>"
    });
    expect(body.history[2]).toMatchObject({
      direction: "outbound",
      provider: "smtp",
      source: "app",
      htmlBody: "<p>Sent from app</p>"
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

  it("does not leak outbound history when another recipient only contains the customer's address as a substring", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const customer = await prisma.customer.create({
      data: {
        fullName: "Ann Student",
        normalizedFullName: "ann student",
        email: "ann@example.com",
        phone: "0400000004",
        normalizedEmail: "ann@example.com",
        normalizedPhone: "0400000004",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    await prisma.outboundEmail.createMany({
      data: [
        {
          toEmail: "joann@example.com",
          subject: "Wrong customer",
          htmlBody: "<p>Should not appear</p>",
          status: "sent",
          provider: "smtp",
          source: "app",
          createdAt: new Date("2026-03-18T12:00:00.000Z")
        },
        {
          toEmail: "Ann Student <ann@example.com>",
          subject: "Correct customer",
          htmlBody: "<p>Should appear</p>",
          status: "sent",
          provider: "smtp",
          source: "app",
          createdAt: new Date("2026-03-18T11:00:00.000Z")
        }
      ]
    });

    const response = await GET(
      authRequest(`http://localhost/api/admin/customers/${customer.id}/email`, token),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      history: Array<{ subject: string }>;
    };

    expect(body.history.map((email) => email.subject)).toEqual(["Correct customer"]);
  });

  it("treats plain-text outbound bodies as viewer text content", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const customer = await prisma.customer.create({
      data: {
        fullName: "Jamie Student",
        normalizedFullName: "jamie student",
        email: "jamie@example.com",
        phone: "0400000005",
        normalizedEmail: "jamie@example.com",
        normalizedPhone: "0400000005",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    await prisma.outboundEmail.create({
      data: {
        toEmail: "jamie@example.com",
        subject: "Plain text Gmail import",
        htmlBody: "Lesson moved to Thursday at 4pm.",
        status: "sent",
        provider: "gmail",
        source: "gmail",
        externalId: "gmail-plain-text-1",
        createdAt: new Date("2026-03-18T10:30:00.000Z")
      }
    });

    const response = await GET(
      authRequest(`http://localhost/api/admin/customers/${customer.id}/email`, token),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      history: Array<{ subject: string; htmlBody?: string; textBody?: string }>;
    };

    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      subject: "Plain text Gmail import",
      textBody: "Lesson moved to Thursday at 4pm."
    });
    expect(body.history[0]?.htmlBody).toBeUndefined();
  });

  it("falls back to the inbound snippet when full body text is unavailable", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const customer = await prisma.customer.create({
      data: {
        fullName: "Casey Student",
        normalizedFullName: "casey student",
        email: "casey@example.com",
        phone: "0400000006",
        normalizedEmail: "casey@example.com",
        normalizedPhone: "0400000006",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    await prisma.customerInboundEmail.create({
      data: {
        customerId: customer.id,
        provider: "imap",
        source: "imap",
        externalId: "imap-snippet-only-1",
        fromEmail: "casey@example.com",
        toEmail: "owner@example.com",
        subject: "Quick question",
        snippet: "Can we start 15 minutes later?",
        bodyText: null,
        status: "received",
        receivedAt: new Date("2026-03-18T11:30:00.000Z")
      }
    });

    const response = await GET(
      authRequest(`http://localhost/api/admin/customers/${customer.id}/email`, token),
      { params: Promise.resolve({ id: customer.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      history: Array<{ subject: string; textBody?: string }>;
    };

    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      subject: "Quick question",
      textBody: "Can we start 15 minutes later?"
    });
  });
});
