import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { consumeRateLimit, getRequestIpFromHeaders } from "@/lib/rate-limit";
import { dateTimeLocalToDate, toDateKey } from "@/lib/time";

type RouteContext = { params: Promise<{ id: string }> };

const statsEventSchema = z.object({
  type: z.enum(["impression", "click", "dismissal"])
});

/** Maps a public event type to its PopupDayStat counter column. */
const COUNTER_FIELD = {
  impression: "impressions",
  click: "clicks",
  dismissal: "dismissals"
} as const;

/**
 * Public, unauthenticated write endpoint — the only write path in the popup
 * feature a visitor can reach, so it is deliberately narrow: it can only
 * increment one counter on one existing popup's per-day row. It never returns
 * popup data (write-only ack) and never persists anything that identifies the
 * visitor — no IP, no user agent, no cookie. The IP is used only to key the
 * ephemeral in-memory buckets below, which are never written to the database.
 *
 * AC-43, two layers on the existing in-memory `consumeRateLimit`
 * (src/lib/rate-limit.ts — the same limiter `/api/booking-requests` uses via
 * `verifyCaptchaGuard`; used directly here since a silent beacon has no
 * CAPTCHA form to gate):
 *  - a broad per-IP cap against flood/abuse.
 *  - a narrow per-(IP, popup, event type) lock that collapses an accidental
 *    duplicate fire (double-click, retry, re-render) within a few seconds
 *    into a single count, acking success without telling the caller it
 *    happened.
 *
 * `day` matches the PopupDayStat/PageViewDaily convention (start-of-day in
 * the business timezone) via the same `toDateKey`/`dateTimeLocalToDate` pair
 * the analytics rollup job uses. The upsert is atomic on the `(popupId, day)`
 * unique constraint, so concurrent events for the same popup/day can't race
 * into duplicate rows.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const parsed = statsEventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
    }
    const { type } = parsed.data;

    const ip = getRequestIpFromHeaders(request.headers);

    const broad = consumeRateLimit({ key: `popup-stats:${ip}`, limit: 60, windowMs: 60 * 1000 });
    if (!broad.allowed) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(broad.retryAfterSeconds) } }
      );
    }

    // ponytail: in-memory dedup, single-process only (same store as
    // consumeRateLimit) — a multi-instance deployment would need a shared
    // store (Redis) to dedup across processes.
    const dedup = consumeRateLimit({ key: `popup-stats:${ip}:${id}:${type}`, limit: 1, windowMs: 5000 });
    if (!dedup.allowed) {
      return NextResponse.json({ ok: true });
    }

    const popup = await prisma.sitePopup.findUnique({ where: { id }, select: { id: true } });
    if (!popup) {
      return NextResponse.json({ error: "Popup not found." }, { status: 404 });
    }

    const day = dateTimeLocalToDate(`${toDateKey(new Date())}T00:00`);
    if (!day) {
      return NextResponse.json({ error: "Unable to resolve today's date." }, { status: 500 });
    }

    const field = COUNTER_FIELD[type];
    await prisma.popupDayStat.upsert({
      where: { popupId_day: { popupId: id, day } },
      create: { popupId: id, day, [field]: 1 },
      update: { [field]: { increment: 1 } }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to record popup event.");
  }
}
