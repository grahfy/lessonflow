import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { getGmailUserProfile, isGmailConfigured } from "@/lib/email/gmail-service";

/**
 * GET: Returns current Gmail connection status and profile email.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const configured = isGmailConfigured();
    if (!configured) {
      return NextResponse.json({ 
        status: "not_configured",
        message: "Gmail credentials missing from environment variables."
      });
    }

    const email = await getGmailUserProfile();
    if (!email) {
      return NextResponse.json({ 
        status: "error",
        message: "Unable to connect to Gmail API. Check credentials and token validity."
      });
    }

    return NextResponse.json({ 
      status: "connected",
      email,
      message: "Successfully connected to Gmail API."
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to check Gmail status.");
  }
}
