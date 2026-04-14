/**
 * Page View Analytics — Tracking Service
 *
 * Captures lightweight, privacy-friendly page view events for public pages.
 * No PII is stored: IP addresses are used transiently for geo-lookup then discarded.
 * No cookies or localStorage are used. Device type is derived from screen width.
 *
 * DESIGN RATIONALE:
 * 1. Fire-and-Forget: DB writes are not awaited, matching the `persistLog`
 *    pattern in observability.ts. A failing analytics write never blocks or
 *    errors a page request.
 * 2. Privacy-First: Only aggregate dimensions are stored (path, referrer domain,
 *    country code, device category). This is equivalent to server log analysis
 *    and does not require cookie consent.
 * 3. Bot Filtering: Common crawlers and monitoring agents are excluded via
 *    user-agent substring matching to keep analytics data meaningful.
 */

import { prisma } from "@/lib/db";

/** Public page paths eligible for analytics tracking. */
export const TRACKED_PUBLIC_PATHS = new Set([
  "/",
  "/book",
  "/contact",
  "/lessons",
  "/teacher",
  "/videos",
  "/vouchers",
  "/privacy",
  "/terms",
  "/terms-of-service"
]);

/** Known bot user-agent substrings (case-insensitive matching). */
const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "lighthouse",
  "pagespeed",
  "headlesschrome",
  "phantomjs",
  "slurp",
  "mediapartners",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "applebot",
  "yandex",
  "baiduspider",
  "duckduckbot",
  "sogou",
  "exabot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "dotbot",
  "petalbot",
  "uptimerobot",
  "pingdom",
  "statuspage"
];

/**
 * Returns true if the user-agent string matches a known bot pattern.
 */
export function isBot(userAgent: string): boolean {
  const lower = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Classifies device type from viewport width reported by the client beacon.
 */
export function parseDeviceType(screenWidth: number): "desktop" | "mobile" | "tablet" {
  if (screenWidth < 768) return "mobile";
  if (screenWidth < 1024) return "tablet";
  return "desktop";
}

/**
 * Extracts the domain from a referrer URL, filtering out the site's own domain.
 * Returns null for direct visits, empty referrers, or same-site navigations.
 */
export function parseReferrerDomain(referrer: string | null | undefined, ownHost: string): string | null {
  if (!referrer) return null;

  try {
    const url = new URL(referrer);
    const domain = url.hostname.replace(/^www\./, "");
    const own = ownHost.replace(/^www\./, "").split(":")[0];

    if (domain === own) return null;
    return domain;
  } catch {
    return null;
  }
}

/**
 * Persists a page view event to the database (fire-and-forget).
 *
 * RATIONALE: We do NOT await this promise to avoid blocking the API response.
 * Failures are caught and logged to stderr so analytics issues don't crash requests.
 */
export function recordPageView(data: {
  path: string;
  referrer: string | null;
  country: string | null;
  deviceType: string;
}): void {
  prisma.pageView.create({
    data: {
      path: data.path,
      referrer: data.referrer,
      country: data.country,
      deviceType: data.deviceType
    }
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[analytics] Failed to record page view: ${message}`);
  });
}
