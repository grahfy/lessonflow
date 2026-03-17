import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as sendAdminReportEmail } from "@/app/api/admin/reports/email/route";
import { POST as sendScheduledAdminReport } from "@/app/api/jobs/admin-reports/[period]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as adminReports from "@/lib/admin-reports";
import * as emailService from "@/lib/email/service";

function ownerRequest(body: Record<string, unknown>, token: string) {
  return new NextRequest("http://localhost/api/admin/reports/email", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-report-email-routes", () => {
  beforeEach(async () => {
    await prisma.adminUser.deleteMany();
    vi.restoreAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  it("rejects manual owner report sends when no live email provider is configured", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    vi.spyOn(adminReports, "getAdminReportsDashboard").mockResolvedValue({
      generatedAt: "2026-03-18T00:00:00.000Z",
      periods: {
        daily: {
          key: "daily",
          label: "Today",
          start: "2026-03-18T00:00:00.000Z",
          end: "2026-03-18T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Yesterday",
            previousStart: "2026-03-17T00:00:00.000Z",
            previousEnd: "2026-03-17T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        },
        monthly: {
          key: "monthly",
          label: "Month",
          start: "2026-03-01T00:00:00.000Z",
          end: "2026-03-31T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Previous month",
            previousStart: "2026-02-01T00:00:00.000Z",
            previousEnd: "2026-02-28T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        },
        yearly: {
          key: "yearly",
          label: "Year",
          start: "2026-01-01T00:00:00.000Z",
          end: "2026-12-31T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Previous year",
            previousStart: "2025-01-01T00:00:00.000Z",
            previousEnd: "2025-12-31T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        },
        weekly: {
          key: "weekly",
          label: "Week",
          start: "2026-03-16T00:00:00.000Z",
          end: "2026-03-22T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Previous week",
            previousStart: "2026-03-09T00:00:00.000Z",
            previousEnd: "2026-03-15T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        }
      },
      trends: {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: []
      }
    });
    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({ status: "queued_no_smtp" });

    const response = await sendAdminReportEmail(ownerRequest({ period: "daily" }, token));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  it("rejects scheduled owner report sends when no live email provider is configured", async () => {
    vi.spyOn(adminReports, "getAdminReportsDashboard").mockResolvedValue({
      generatedAt: "2026-03-18T00:00:00.000Z",
      periods: {
        daily: {
          key: "daily",
          label: "Today",
          start: "2026-03-18T00:00:00.000Z",
          end: "2026-03-18T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Yesterday",
            previousStart: "2026-03-17T00:00:00.000Z",
            previousEnd: "2026-03-17T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        },
        monthly: {
          key: "monthly",
          label: "Month",
          start: "2026-03-01T00:00:00.000Z",
          end: "2026-03-31T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Previous month",
            previousStart: "2026-02-01T00:00:00.000Z",
            previousEnd: "2026-02-28T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        },
        yearly: {
          key: "yearly",
          label: "Year",
          start: "2026-01-01T00:00:00.000Z",
          end: "2026-12-31T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Previous year",
            previousStart: "2025-01-01T00:00:00.000Z",
            previousEnd: "2025-12-31T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        },
        weekly: {
          key: "weekly",
          label: "Week",
          start: "2026-03-16T00:00:00.000Z",
          end: "2026-03-22T23:59:59.999Z",
          appointments: { confirmedCount: 1, cancelledCount: 0 },
          appointmentPipeline: { pendingRequestCount: 0, upcomingConfirmedCount: 1 },
          outstandingInvoices: { count: 0, totalCents: 0, overdueCount: 0, overdueTotalCents: 0 },
          earnings: { netPaidCents: 1000, invoicePaidCents: 1000, creditNotePaidCents: 0, paidDocumentCount: 1 },
          details: {
            pendingAppointments: [],
            upcomingConfirmedAppointments: [],
            cancelledAppointments: [],
            outstandingInvoices: []
          },
          comparison: {
            previousLabel: "Previous week",
            previousStart: "2026-03-09T00:00:00.000Z",
            previousEnd: "2026-03-15T23:59:59.999Z",
            earningsDeltaCents: 0,
            earningsDeltaPercent: null,
            appointmentsDelta: 0
          }
        }
      },
      trends: {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: []
      }
    });
    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({ status: "queued_no_smtp" });

    const response = await sendScheduledAdminReport(
      new NextRequest("http://localhost/api/jobs/admin-reports/daily", {
        method: "POST",
        headers: {
          "x-cron-secret": "cron-secret"
        }
      }),
      { params: Promise.resolve({ period: "daily" }) }
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });
});
