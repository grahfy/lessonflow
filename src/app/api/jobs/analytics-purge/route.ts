/**
 * Scheduled Job: Analytics Data Purge
 *
 * Deletes raw PageView records older than 90 days to keep the table size
 * manageable. Aggregated PageViewDaily data is retained indefinitely.
 *
 * Designed to run weekly via systemd timer.
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { hasCronSecret } from "@/lib/env";
import { logEvent } from "@/lib/observability";

const RETENTION_DAYS = 90;

export async function POST(request: NextRequest) {
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const { count } = await prisma.pageView.deleteMany({
      where: {
        createdAt: { lt: cutoff }
      }
    });

    logEvent("analytics.purge.completed", {
      deletedCount: count,
      olderThan: cutoff.toISOString()
    });

    return NextResponse.json({
      ok: true,
      deletedCount: count
    });
  } catch (err) {
    console.error("[analytics-purge] Failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
