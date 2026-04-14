"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Lightweight page view tracker that fires a beacon to /api/analytics/pageview
 * on each public page navigation. Renders no UI.
 *
 * DESIGN RATIONALE:
 * - Uses navigator.sendBeacon() for reliable, non-blocking delivery.
 * - Tracks pathname changes via usePathname() to capture App Router navigations.
 * - Sends screen width (not user-agent) for device classification — the server
 *   reads UA from the request headers instead.
 * - No cookies, no localStorage, no PII. Privacy-friendly by design.
 * - Deduplicates by tracking the last-sent path to avoid double-fires on
 *   hydration or re-renders within the same navigation.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastTrackedPath.current) return;
    lastTrackedPath.current = pathname;

    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;

    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
      screenWidth: window.innerWidth
    });

    navigator.sendBeacon("/api/analytics/pageview", new Blob([payload], { type: "application/json" }));
  }, [pathname]);

  return null;
}
