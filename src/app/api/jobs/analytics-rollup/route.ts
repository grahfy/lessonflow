/**
 * Scheduled Job: Analytics Rollup
 *
 * Aggregates the previous day's raw PageView records into pre-computed
 * PageViewDaily summary rows. Designed to run hourly via
 * systemd timer hitting this endpoint with the x-cron-secret header.
 *
 * DESIGN RATIONALE:
 * 1. Idempotent: Uses upsert so re-running for the same day is safe.
 * 2. Yesterday-only: Only processes the completed previous day to avoid
 *    partial-day aggregation.
 * 3. Batched: Groups raw events into dimension tuples and writes each
 *    as a single upsert, keeping DB round-trips proportional to the
 *    number of unique (path, referrer, country, device) combinations
 *    rather than the number of raw events.
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { hasCronSecret } from "@/lib/env";
import { logEvent } from "@/lib/observability";
import { dateTimeLocalToDate, toDateKey } from "@/lib/time";

export async function POST(request: NextRequest) {
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Calculate yesterday's window in the configured business timezone so the
    // stored `date` dimension and the raw-event window align with the calendar
    // day used everywhere else, regardless of the server process TZ.
    const now = new Date();
    const todayKey = toDateKey(now);
    const yesterdayKeyDate = new Date(`${todayKey}T00:00:00.000Z`);
    yesterdayKeyDate.setUTCDate(yesterdayKeyDate.getUTCDate() - 1);
    const yesterdayKey = `${yesterdayKeyDate.getUTCFullYear()}-${String(yesterdayKeyDate.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterdayKeyDate.getUTCDate()).padStart(2, "0")}`;

    const yesterdayStart = dateTimeLocalToDate(`${yesterdayKey}T00:00`);
    const yesterdayEnd = dateTimeLocalToDate(`${todayKey}T00:00`);
    if (!yesterdayStart || !yesterdayEnd) {
      return NextResponse.json({ error: "Failed to resolve rollup window." }, { status: 500 });
    }

    // Fetch raw page views for yesterday (half-open window: [start, nextStart)).
    const rawViews = await prisma.pageView.findMany({
      where: {
        createdAt: { gte: yesterdayStart, lt: yesterdayEnd }
      },
      select: {
        path: true,
        referrer: true,
        country: true,
        deviceType: true
      }
    });

    // Group into dimension tuples
    const groups = new Map<string, { path: string; referrer: string | null; country: string | null; deviceType: string; count: number }>();

    for (const view of rawViews) {
      const key = `${view.path}|${view.referrer ?? ""}|${view.country ?? ""}|${view.deviceType}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        groups.set(key, {
          path: view.path,
          referrer: view.referrer,
          country: view.country,
          deviceType: view.deviceType,
          count: 1
        });
      }
    }

    // Upsert each group into PageViewDaily
    let rowsCreated = 0;
    for (const group of groups.values()) {
      const referrer = group.referrer ?? "";
      const country = group.country ?? "";
      await prisma.pageViewDaily.upsert({
        where: {
          date_path_referrer_country_deviceType: {
            date: yesterdayStart,
            path: group.path,
            referrer,
            country,
            deviceType: group.deviceType
          }
        },
        update: {
          count: group.count
        },
        create: {
          date: yesterdayStart,
          path: group.path,
          referrer,
          country,
          deviceType: group.deviceType,
          count: group.count
        }
      });
      rowsCreated += 1;
    }

    logEvent("analytics.rollup.completed", {
      date: yesterdayKey,
      rawEvents: rawViews.length,
      rowsCreated
    });

    return NextResponse.json({
      ok: true,
      date: yesterdayKey,
      rawEvents: rawViews.length,
      rowsCreated
    });
  } catch (err) {
    console.error("[analytics-rollup] Failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
