import { NextRequest, NextResponse } from "next/server";
import { getCronSecret, hasCronSecret } from "@/lib/env";
import { syncGmailSentMessages } from "@/lib/gmail/sync";
import { isGmailConfigured } from "@/lib/email/gmail-service";

/**
 * Scheduled job endpoint that syncs sent messages from Gmail.
 * Protected by `x-cron-secret`.
 */
export async function POST(request: NextRequest) {
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== getCronSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json({ error: "Gmail is not configured." }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const maxResults = body.maxResults || 50;

    const result = await syncGmailSentMessages(maxResults);

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
