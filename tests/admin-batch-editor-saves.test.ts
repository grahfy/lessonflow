import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { POST as saveContent } from "@/app/api/admin/content/route";
import { POST as saveEmailTemplates } from "@/app/api/admin/email-templates/route";

function adminRequest(url: string, token: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin batch editor saves", () => {
  beforeEach(async () => {
    await prisma.publicPageContent.deleteMany();
    await prisma.emailTemplate.deleteMany();
  });

  it("saves content entries in one batch request", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveContent(
      adminRequest("http://localhost/api/admin/content", token, {
        entries: [
          {
            pagePath: "/",
            sectionKey: "hero",
            content: { heading: "Welcome" }
          },
          {
            pagePath: "/lessons",
            sectionKey: "faq",
            content: { items: ["A", "B"] }
          }
        ]
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { savedCount: number };
    expect(body.savedCount).toBe(2);

    const records = await prisma.publicPageContent.findMany({
      orderBy: [{ pagePath: "asc" }, { sectionKey: "asc" }]
    });
    expect(records).toHaveLength(2);
    expect(records[0]?.pagePath).toBe("/");
    expect(records[1]?.pagePath).toBe("/lessons");
  });

  it("rejects invalid content batches without writing partial data", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.publicPageContent.create({
      data: {
        pagePath: "/",
        sectionKey: "hero",
        content: { heading: "Original" }
      }
    });

    const response = await saveContent(
      adminRequest("http://localhost/api/admin/content", token, {
        entries: [
          {
            pagePath: "/",
            sectionKey: "hero",
            content: { heading: "Updated" }
          },
          {
            pagePath: "/contact",
            content: { heading: "Broken" }
          }
        ]
      })
    );

    expect(response.status).toBe(400);

    const records = await prisma.publicPageContent.findMany();
    expect(records).toHaveLength(1);
    expect(records[0]?.content).toEqual({ heading: "Original" });
  });

  it("saves email templates in one batch request", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveEmailTemplates(
      adminRequest("http://localhost/api/admin/email-templates", token, {
        templates: [
          {
            templateKey: "booking_confirmation",
            subject: "Booked",
            htmlBody: "<p>Booked</p>"
          },
          {
            templateKey: "invoice_reminder",
            subject: "Reminder",
            htmlBody: "<p>Reminder</p>"
          }
        ]
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { savedCount: number };
    expect(body.savedCount).toBe(2);

    const templates = await prisma.emailTemplate.findMany({
      orderBy: { templateKey: "asc" }
    });
    expect(templates).toHaveLength(2);
    expect(templates[0]?.templateKey).toBe("booking_confirmation");
    expect(templates[1]?.templateKey).toBe("invoice_reminder");
  });

  it("rejects invalid email template batches without writing partial data", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.emailTemplate.create({
      data: {
        templateKey: "booking_confirmation",
        subject: "Original",
        htmlBody: "<p>Original</p>"
      }
    });

    const response = await saveEmailTemplates(
      adminRequest("http://localhost/api/admin/email-templates", token, {
        templates: [
          {
            templateKey: "booking_confirmation",
            subject: "Updated",
            htmlBody: "<p>Updated</p>"
          },
          {
            templateKey: "invoice_reminder",
            subject: "",
            htmlBody: "<p>Broken</p>"
          }
        ]
      })
    );

    expect(response.status).toBe(400);

    const templates = await prisma.emailTemplate.findMany();
    expect(templates).toHaveLength(1);
    expect(templates[0]?.subject).toBe("Original");
  });
});
