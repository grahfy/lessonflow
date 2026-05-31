import { NextRequest, NextResponse } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { getOwnerEmail, hasCronSecret } from "@/lib/env";
import { sendEmail } from "@/lib/email/service";
import { ownerOperationsReportTemplate } from "@/lib/email/templates";
import { getAdminReportsDashboard } from "@/lib/admin-reports";
import { jsonUnexpectedError } from "@/lib/api-errors";

const ALLOWED_PERIODS = new Set(["daily", "weekly", "monthly", "yearly"]);

type RouteContext = {
  params: Promise<{
    period: string;
  }>;
};

/**
 * Scheduled owner report sender (daily/weekly/monthly).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!hasCronSecret()) {
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
    }

    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { period: periodParam } = await context.params;
    const period = String(periodParam || "").toLowerCase();
    if (!ALLOWED_PERIODS.has(period)) {
      return NextResponse.json({ error: "Unknown report period." }, { status: 400 });
    }

    const dashboard = await getAdminReportsDashboard();
    const periodKey = period as "daily" | "weekly" | "monthly" | "yearly";
    const report = dashboard.periods[periodKey];
    const trend = dashboard.trends[periodKey];
    const template = ownerOperationsReportTemplate({
      period: periodKey,
      generatedAt: new Date(dashboard.generatedAt),
      report,
      trend
    });

    const sendResult = await sendEmail({
      to: getOwnerEmail(),
      subject: template.subject,
      html: template.html,
      notification: {
        triggerMode: "automated",
        category: "owner_scheduled_reports"
      }
    });

    if (sendResult.status === "suppressed") {
      return NextResponse.json({
        ok: true,
        period: periodKey,
        deliveryStatus: sendResult.status,
        suppressed: true,
        message: sendResult.error || "Scheduled report skipped by notification settings.",
        generatedAt: dashboard.generatedAt,
        appointmentsConfirmed: report.appointments.confirmedCount,
        outstandingInvoices: report.outstandingInvoices.count,
        netPaidCents: report.earnings.netPaidCents
      });
    }

    if (sendResult.status === "queued_no_smtp") {
      return NextResponse.json(
        {
          error: "Report email delivery is not configured on this host. Configure a live email provider before scheduled report jobs run."
        },
        { status: 503 }
      );
    }

    if (sendResult.status === "failed") {
      return NextResponse.json({ error: sendResult.error || "Unable to send report email." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      period: periodKey,
      deliveryStatus: sendResult.status,
      generatedAt: dashboard.generatedAt,
      appointmentsConfirmed: report.appointments.confirmedCount,
      outstandingInvoices: report.outstandingInvoices.count,
      netPaidCents: report.earnings.netPaidCents
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send scheduled report.");
  }
}
