import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { verifyCronSecret } from "@/lib/cron-auth";
import { hasCronSecret } from "@/lib/env";
import { syncGmailSentMessages } from "@/lib/gmail/sync";
import { isGmailConfigured } from "@/lib/email/gmail-service";

const requestSchema = z.object({
  maxResults: z.number().int().min(1).max(500).optional()
});

/**
 * Scheduled job endpoint that syncs sent messages from Gmail.
 * Protected by `x-cron-secret`.
 */
export async function POST(request: NextRequest) {
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json({ error: "Gmail is not configured." }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sync payload.", details: parsed.error.flatten() }, { status: 400 });
    }
    const maxResults = parsed.data.maxResults ?? 50;

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
