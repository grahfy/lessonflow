import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as getNotificationSettings, POST as saveNotificationSettings } from "@/app/api/admin/notification-settings/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminJsonRequest(url: string, token: string, init?: { method?: string; body?: Record<string, unknown> }) {
  return new NextRequest(url, {
    method: init?.method || "GET",
    body: init?.body ? JSON.stringify(init.body) : undefined,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-notification-settings", () => {
  beforeEach(async () => {
    await prisma.notificationSettings.deleteMany();
  });

  it("loads default notification settings when no custom record exists", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await getNotificationSettings(adminJsonRequest("http://localhost/api/admin/notification-settings", token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      notificationSettings: {
        globalAutomatedEmailEnabled: boolean;
        automaticInvoiceRemindersEnabled: boolean;
        invoiceReminderFirstDelayDays: number;
        invoiceReminderResendIntervalDays: number;
        categoryPreferences: Record<string, boolean>;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.notificationSettings.globalAutomatedEmailEnabled).toBe(true);
    expect(body.notificationSettings.automaticInvoiceRemindersEnabled).toBe(true);
    expect(body.notificationSettings.invoiceReminderFirstDelayDays).toBe(7);
    expect(body.notificationSettings.invoiceReminderResendIntervalDays).toBe(7);
    expect(body.notificationSettings.categoryPreferences.owner_contact).toBe(true);
    expect(body.notificationSettings.categoryPreferences.owner_booking_requests).toBe(true);
    expect(body.notificationSettings.categoryPreferences.customer_booking_updates).toBe(true);
    expect(body.notificationSettings.categoryPreferences.owner_daily_digest).toBe(true);
    expect(body.notificationSettings.categoryPreferences.owner_scheduled_reports).toBe(true);
  });

  it("saves notification settings and reloads the persisted values", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const saveResponse = await saveNotificationSettings(
      adminJsonRequest("http://localhost/api/admin/notification-settings", token, {
        method: "POST",
        body: {
          globalAutomatedEmailEnabled: true,
          categoryPreferences: {
            owner_contact: false,
            owner_booking_requests: true,
            customer_booking_updates: false,
            owner_daily_digest: true,
            owner_scheduled_reports: false
          },
          automaticInvoiceRemindersEnabled: false,
          invoiceReminderFirstDelayDays: 10,
          invoiceReminderResendIntervalDays: 5,
          autoCreateInvoiceOnApproval: false,
          lessonReminderEnabled: true,
          lessonReminderHoursBefore: 24,
          errorAlertsEnabled: true
        }
      })
    );
    expect(saveResponse.status).toBe(200);

    const loadResponse = await getNotificationSettings(adminJsonRequest("http://localhost/api/admin/notification-settings", token));
    const loadBody = (await loadResponse.json()) as {
      notificationSettings: {
        categoryPreferences: Record<string, boolean>;
        automaticInvoiceRemindersEnabled: boolean;
        invoiceReminderFirstDelayDays: number;
        invoiceReminderResendIntervalDays: number;
      };
    };

    expect(loadBody.notificationSettings.categoryPreferences.owner_contact).toBe(false);
    expect(loadBody.notificationSettings.categoryPreferences.customer_booking_updates).toBe(false);
    expect(loadBody.notificationSettings.categoryPreferences.owner_scheduled_reports).toBe(false);
    expect(loadBody.notificationSettings.automaticInvoiceRemindersEnabled).toBe(false);
    expect(loadBody.notificationSettings.invoiceReminderFirstDelayDays).toBe(10);
    expect(loadBody.notificationSettings.invoiceReminderResendIntervalDays).toBe(5);
  });

  it("returns field validation errors for invalid reminder cadence values", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveNotificationSettings(
      adminJsonRequest("http://localhost/api/admin/notification-settings", token, {
        method: "POST",
        body: {
          globalAutomatedEmailEnabled: true,
          categoryPreferences: {
            owner_contact: true,
            owner_booking_requests: true,
            customer_booking_updates: true,
            owner_daily_digest: true,
            owner_scheduled_reports: true
          },
          automaticInvoiceRemindersEnabled: true,
          invoiceReminderFirstDelayDays: 0,
          invoiceReminderResendIntervalDays: 999
        }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      ok: boolean;
      fieldErrors?: Record<string, string>;
    };

    expect(body.ok).toBe(false);
    expect(body.fieldErrors?.invoiceReminderFirstDelayDays).toBeTruthy();
    expect(body.fieldErrors?.invoiceReminderResendIntervalDays).toBeTruthy();
  });
});
