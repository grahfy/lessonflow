/**
 * Public Page View Beacon Endpoint
 *
 * Receives lightweight page view events from the client-side PageViewTracker
 * component via navigator.sendBeacon(). Performs geo-lookup from request
 * headers, validates the tracked path, and persists the event asynchronously.
 *
 * DESIGN RATIONALE:
 * 1. Returns 204 immediately: The DB write is fire-and-forget. The client
 *    does not need (or receive) any response body.
 * 2. Path allowlist: Only known public routes are tracked. This prevents
 *    abuse by sending arbitrary path values.
 * 3. Bot filtering: Crawlers that somehow execute the beacon JS are filtered
 *    out via user-agent matching.
 * 4. No auth required: This is a public endpoint. It stores no PII and
 *    returns no data, so there is minimal abuse surface.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  isBot,
  parseDeviceType,
  parseReferrerDomain,
  recordPageView,
  TRACKED_PUBLIC_PATHS
} from "@/lib/analytics";
import { resolveRequestCountry } from "@/lib/geo-country";

const EMPTY_204 = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userAgent = request.headers.get("user-agent") || "";
  if (isBot(userAgent)) {
    return EMPTY_204();
  }

  let body: { path?: unknown; referrer?: unknown; screenWidth?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return EMPTY_204();
  }

  const path = typeof body.path === "string" ? body.path : null;
  if (!path || !TRACKED_PUBLIC_PATHS.has(path)) {
    return EMPTY_204();
  }

  const screenWidth = typeof body.screenWidth === "number" ? body.screenWidth : 1920;
  const referrerRaw = typeof body.referrer === "string" ? body.referrer : null;
  const ownHost = request.headers.get("host") || "";
  const referrer = parseReferrerDomain(referrerRaw, ownHost);
  const deviceType = parseDeviceType(screenWidth);

  // Geo-lookup is async but we don't block the response on it.
  // Fire the whole chain (geo + DB write) without awaiting.
  resolveRequestCountry(request.headers)
    .then(({ country }) => {
      recordPageView({ path, referrer, country, deviceType });
    })
    .catch(() => {
      // Geo failed — still record the view without country data.
      recordPageView({ path, referrer, country: null, deviceType });
    });

  return EMPTY_204();
}
