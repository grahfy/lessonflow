"use client";

import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect } from "react";

import { PageViewTracker } from "@/components/page-view-tracker";
import { PublicCookieConsentBanner } from "@/components/public-cookie-consent-banner";
import { SitePopupContainer } from "@/components/public/site-popup-container";
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
  "/privacy": "Privacy disclosures explain how student and communication data is handled.",
  "/terms-of-service": "Service terms cover portal use and connected communication tools.",
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
type PublicSiteFrameProps = PropsWithChildren<{
  brandName: string;
}>;

export function PublicSiteFrame({ brandName, children }: PublicSiteFrameProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const run = () => {
      primePublicHeroImages();
    };

    // Defer preload work until idle time so first paint/navigation remains responsive.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const ric = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback: (id: number) => void }).requestIdleCallback;
      const cic = (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback;
      const id = ric(run, { timeout: 1000 });
      return () => cic(id);
    }
    const timer = globalThis.setTimeout(run, 80);
    return () => globalThis.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const run = () => {
      for (const route of publicRouteOrder) {
        router.prefetch(route);
      }
    };

    // Route prefetching is also pushed to idle time to avoid competing with initial hydration.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const ric = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      const cic = (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback;
      const id = ric(run, { timeout: 1200 });
      return () => cic(id);
    }
    const timer = globalThis.setTimeout(run, 140);
    return () => globalThis.clearTimeout(timer);
  }, [router]);

  if (!isPublicRoute(pathname)) {
    // Allow non-public routes (admin/student/setup) to render without public chrome.
    return <>{children}</>;
  }

  const footerCopy = PUBLIC_FOOTER_COPY[pathname] || PUBLIC_FOOTER_COPY["/"];
  return (
    <SiteShell brandName={brandName} footerCopy={footerCopy}>
      {children}
      <PublicCookieConsentBanner />
      <SitePopupContainer />
      <PageViewTracker />
    </SiteShell>
  );
}
