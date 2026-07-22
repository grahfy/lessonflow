import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { matchesTargetPath, selectMostRecentPopup, type Popup } from "@/lib/popups/display-rules";

/**
 * Public, unauthenticated: returns the single popup (if any) that should show
 * on the given `?path=` right now (AC-36..AC-41).
 *
 * One indexed query does the enabled + schedule gate (AC-36/37/38), using
 * `@@index([enabled, startAt, endAt])`; path matching (AC-39) and
 * most-recent-wins selection (AC-41) run in JS via display-rules.ts against
 * that small result set — no second query.
 *
 * Deliberately does NOT evaluate the repeat policy (AC-40): that depends on
 * per-visitor view history (last-seen timestamp, seen-this-session), which
 * lives in the browser. This endpoint is anonymous and mints no tracking
 * cookie to fake one server-side — that would be a privacy decision this site
 * already gates behind its cookie-consent banner, not something to route
 * around here. Instead the response carries `repeatPolicy`/`repeatDays`/
 * `delaySeconds` so the client applies `isRepeatAllowed()` itself.
 *
 * Never returns `createdById`, the internal `title`, `targetPaths`, or
 * timestamps — only what the public renderer needs.
 */
export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get("path") || "/";
    const now = new Date();

    const rows = await prisma.sitePopup.findMany({
      where: {
        enabled: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] }
        ]
      },
      select: {
        id: true,
        heading: true,
        bodyHtml: true,
        imageUrl: true,
        imageAlt: true,
        ctaLabel: true,
        ctaUrl: true,
        formFactor: true,
        animation: true,
        backgroundColor: true,
        textColor: true,
        buttonBackgroundColor: true,
        buttonTextColor: true,
        widthPx: true,
        cornerRadiusPx: true,
        imagePlacement: true,
        targetPaths: true,
        delaySeconds: true,
        repeatPolicy: true,
        repeatDays: true,
        startAt: true,
        endAt: true,
        enabled: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    const candidates: Popup[] = rows.map((row) => ({
      id: row.id,
      enabled: row.enabled,
      startAt: row.startAt,
      endAt: row.endAt,
      targetPaths: (row.targetPaths as string[] | null) ?? null,
      delaySeconds: row.delaySeconds,
      repeatPolicy: row.repeatPolicy,
      repeatDays: row.repeatDays,
      createdAt: row.createdAt
    }));

    const winner = selectMostRecentPopup(candidates.filter((popup) => matchesTargetPath(popup, path)));
    if (!winner) {
      return NextResponse.json({ popup: null });
    }

    const row = rows.find((candidate) => candidate.id === winner.id)!;
    return NextResponse.json({
      popup: {
        id: row.id,
        heading: row.heading,
        bodyHtml: row.bodyHtml,
        imageUrl: row.imageUrl,
        imageAlt: row.imageAlt,
        ctaLabel: row.ctaLabel,
        ctaUrl: row.ctaUrl,
        formFactor: row.formFactor,
        animation: row.animation,
        backgroundColor: row.backgroundColor,
        textColor: row.textColor,
        buttonBackgroundColor: row.buttonBackgroundColor,
        buttonTextColor: row.buttonTextColor,
        widthPx: row.widthPx,
        cornerRadiusPx: row.cornerRadiusPx,
        imagePlacement: row.imagePlacement,
        delaySeconds: row.delaySeconds,
        repeatPolicy: row.repeatPolicy,
        repeatDays: row.repeatDays
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load the active popup.");
  }
}
