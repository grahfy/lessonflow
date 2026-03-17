import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import type { CustomerEmailAlertsSummary } from "@/lib/admin/customer-email-alerts";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { getUnreadCustomerEmailAlertsSummary } from "@/lib/email/customer-email-alerts";
import { isAdminCustomerEmailAlertsEnabled } from "@/lib/env";

function emptySummary(state: CustomerEmailAlertsSummary["state"]): CustomerEmailAlertsSummary {
  return {
    state,
    provider: null,
    unreadCount: 0,
    matchedCustomers: [],
    messages: [],
    checkedAt: new Date().toISOString()
  };
}

/**
 * Returns owner-only unread customer email alerts for the current admin session.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isAdminCustomerEmailAlertsEnabled()) {
      return NextResponse.json(emptySummary("disabled"));
    }

    return NextResponse.json(await getUnreadCustomerEmailAlertsSummary());
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load customer email alerts.");
  }
}
