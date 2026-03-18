import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { getUnreadCustomerEmailAlertsSummary } from "@/lib/email/customer-email-alerts";

/**
 * Returns owner-only unread customer email alerts for the current admin session.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(await getUnreadCustomerEmailAlertsSummary());
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load customer email alerts.");
  }
}
