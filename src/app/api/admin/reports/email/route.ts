import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { getAdminReportsDashboard } from "@/lib/admin-reports";
import { sendEmail } from "@/lib/email/service";
import { ownerOperationsReportTemplate } from "@/lib/email/templates";
import { getOwnerEmail } from "@/lib/env";

const bodySchema = z.object({
  period: z.enum(["daily", "monthly", "yearly"])
});

/**
 * Sends an owner operations report email on-demand from the admin UI.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid report email request." }, { status: 400 });
    }

    const period = parsed.data.period;
    const dashboard = await getAdminReportsDashboard();
    const report = dashboard.periods[period];
    const trend = dashboard.trends[period];
    const template = ownerOperationsReportTemplate({
      period,
      generatedAt: new Date(dashboard.generatedAt),
      report,
      trend
    });

    const sendResult = await sendEmail({
      to: getOwnerEmail(),
      subject: template.subject,
      html: template.html,
      notification: {
        triggerMode: "manual"
      }
    });

    if (sendResult.status === "queued_no_smtp") {
      return NextResponse.json(
        {
          error: "Report email delivery is not configured on this host. Configure a live email provider before sending reports."
        },
        { status: 503 }
      );
    }

    if (sendResult.status === "failed") {
      return NextResponse.json({ error: sendResult.error || "Unable to send report email." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      period,
      deliveryStatus: sendResult.status
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send admin report email.");
  }
}
