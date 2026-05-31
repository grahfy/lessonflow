import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { hasCronSecret } from "@/lib/env";
import { logEvent } from "@/lib/observability";

/**
 * Scheduled job to purge system logs older than 30 days.
 * Prevents the SystemLog table from growing indefinitely.
 */
export async function POST(request: NextRequest) {
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const { count } = await prisma.systemLog.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    logEvent("System logs purged", { 
      deletedCount: count, 
      olderThan: thirtyDaysAgo.toISOString() 
    });

    return NextResponse.json({
      ok: true,
      deletedCount: count,
    });
  } catch (err) {
    console.error("[purge-logs] Failed to purge logs:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
