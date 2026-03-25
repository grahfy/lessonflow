import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { getCustomerEmailAlertsStatusSummary } from "@/lib/email/customer-email-alerts";
import { isAdminCustomerEmailAlertsEnabled } from "@/lib/env";

/**
 * Returns owner-only readiness and provider status for inbox-backed customer email alerts.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      await getCustomerEmailAlertsStatusSummary(isAdminCustomerEmailAlertsEnabled())
    );
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load customer email alert status.");
  }
}
