"use client";

import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect } from "react";

import { SiteShell } from "@/components/site-shell";
import { primePublicHeroImages } from "@/lib/public-hero-preload";
import { publicRouteOrder } from "@/lib/site-data";

const PUBLIC_FOOTER_COPY: Record<string, string> = {
  "/": "Arrow keys or swipe to move between pages.",
  "/videos": "See and hear Jon's playing style before you book.",
  "/lessons": "Structured pathway with room for your own music style.",
  "/teacher": "Clear instruction. Real-world musical outcomes.",
  "/vouchers": "Digital delivery with simple booking follow-up.",
  "/contact": "Fast response by phone, text, or email.",
  "/book": "Pending requests are reviewed quickly.",
  "/terms": "Policy clarity keeps lessons predictable for everyone.",
  "/student/login": "Use your approval email credentials to access your portal."
};

function isPublicRoute(pathname: string): boolean {
  return pathname in PUBLIC_FOOTER_COPY;
}

/**
 * Wraps recognized public routes in the shared public shell and primes route/media navigation hints.
 *
 * Student/admin pages bypass this wrapper so they can use their own shells and motion scopes.
 */
export function PublicSiteFrame({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const run = () => {
      primePublicHeroImages();
    };

    // Defer preload work until idle time so first paint/navigation remains responsive.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleCallback = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      idleCallback(run, { timeout: 1000 });
      return;
    }
    globalThis.setTimeout(run, 80);
  }, []);

  useEffect(() => {
    const run = () => {
      for (const route of publicRouteOrder) {
        router.prefetch(route);
      }
    };

    // Route prefetching is also pushed to idle time to avoid competing with initial hydration.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleCallback = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      idleCallback(run, { timeout: 1200 });
      return;
    }
    globalThis.setTimeout(run, 140);
  }, [router]);

  if (!isPublicRoute(pathname)) {
    // Allow non-public routes (admin/student/setup) to render without public chrome.
    return <>{children}</>;
  }

  const footerCopy = PUBLIC_FOOTER_COPY[pathname] || PUBLIC_FOOTER_COPY["/"];
  return <SiteShell footerCopy={footerCopy}>{children}</SiteShell>;
}
