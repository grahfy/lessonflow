import { NextRequest, NextResponse } from "next/server";
import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { syncGmailSentMessages } from "@/lib/gmail/sync";
import { isGmailConfigured } from "@/lib/email/gmail-service";

/**
 * POST: Manual sync trigger for admins.
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

    if (!isGmailConfigured()) {
      return NextResponse.json({ error: "Gmail is not configured." }, { status: 400 });
    }

    const result = await syncGmailSentMessages(20); // Smaller batch for manual sync

    return NextResponse.json({ 
      ok: true, 
      ...result 
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to sync Gmail history.");
  }
}
