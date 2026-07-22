"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { isRepeatAllowed } from "@/lib/popups/display-rules";
import { readPublicCookieConsent } from "@/lib/public-cookie-consent";
import type { PopupAnimation, PopupFormFactor, PopupImagePlacement, PopupRepeatPolicy } from "@/generated/prisma/client";

import { SitePopup } from "./site-popup";

/**
 * Thin container: fetches the popup that should show on the current path,
 * applies the client-only repeat-policy gate (AC-40 — schedule/enabled/
 * target-path are already evaluated server-side, see the route's own
 * comment), waits out the author's delay, and fires stats. All the actual
 * rendering lives in the presentational `SitePopup`.
 *
 * Cookie-banner coexistence (team-lead's call to make): suppress ANY popup,
 * regardless of form factor, until the visitor has resolved cookie consent
 * (PublicCookieConsentBanner). A modal's backdrop would otherwise cover the
 * banner outright; a corner/bar popup would compete with it for the same
 * first-visit attention. Consent is a legal surface, not a marketing one, so
 * it wins outright rather than stacking or repositioning around it — this
 * single rule covers all three factors, including the modal case, since none
 * of them ever mount while consent is unresolved.
 */

type ActivePopup = {
  id: string;
  heading: string;
  bodyHtml: string;
  imageUrl: string | null;
  imageAlt: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  formFactor: PopupFormFactor;
  animation: PopupAnimation;
  backgroundColor: string;
  textColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  widthPx: number | null;
  cornerRadiusPx: number | null;
  imagePlacement: PopupImagePlacement;
  delaySeconds: number;
  repeatPolicy: PopupRepeatPolicy;
  repeatDays: number | null;
};

const lastSeenKey = (id: string) => `mgs_popup_last_seen:${id}`;
const seenSessionKey = (id: string) => `mgs_popup_seen_session:${id}`;

function readViewState(id: string) {
  if (typeof window === "undefined") {
    return { lastSeenAt: null, seenThisSession: false };
  }
  const raw = window.localStorage.getItem(lastSeenKey(id));
  return {
    lastSeenAt: raw ? new Date(raw) : null,
    seenThisSession: window.sessionStorage.getItem(seenSessionKey(id)) === "1"
  };
}

function markSeen(id: string) {
  window.localStorage.setItem(lastSeenKey(id), new Date().toISOString());
  window.sessionStorage.setItem(seenSessionKey(id), "1");
}

function postStat(id: string, type: "impression" | "click" | "dismissal") {
  // Fire-and-forget: the endpoint rate-limits/dedupes and always acks, so a
  // failure here must never affect what the visitor sees.
  fetch(`/api/popups/${id}/stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type })
  }).catch(() => {});
}

export function SitePopupContainer() {
  const pathname = usePathname();
  const [popup, setPopup] = useState<ActivePopup | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const impressionFired = useRef(false);

  // Target-page rules are path-scoped, so re-fetch on navigation.
  useEffect(() => {
    let cancelled = false;
    setIsOpen(false);
    impressionFired.current = false;
    fetch(`/api/popups/active?path=${encodeURIComponent(pathname)}`)
      .then((res) => (res.ok ? res.json() : { popup: null }))
      .then((data: { popup: ActivePopup | null }) => {
        if (!cancelled) setPopup(data.popup);
      })
      .catch(() => {
        if (!cancelled) setPopup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!popup) return;
    const currentPopup = popup;
    if (!isRepeatAllowed(currentPopup, readViewState(currentPopup.id), new Date())) return;

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let pollId: ReturnType<typeof setInterval> | undefined;

    function startDelay() {
      showTimer = setTimeout(() => {
        if (!cancelled) setIsOpen(true);
      }, currentPopup.delaySeconds * 1000);
    }

    if (readPublicCookieConsent() !== "unknown") {
      startDelay();
    } else {
      // ponytail: the consent banner has no resolve event to subscribe to,
      // so poll its localStorage value rather than adding a pub/sub layer
      // for one boolean. Upgrade to a shared event if this ever needs to be
      // instant — sub-second precision doesn't matter for a promo delay.
      pollId = setInterval(() => {
        if (readPublicCookieConsent() === "unknown") return;
        clearInterval(pollId);
        if (!cancelled) startDelay();
      }, 300);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (showTimer) clearTimeout(showTimer);
    };
  }, [popup]);

  useEffect(() => {
    if (isOpen && popup && !impressionFired.current) {
      impressionFired.current = true;
      markSeen(popup.id);
      postStat(popup.id, "impression");
    }
  }, [isOpen, popup]);

  if (!popup) return null;

  return (
    <SitePopup
      isOpen={isOpen}
      formFactor={popup.formFactor}
      animation={popup.animation}
      imagePlacement={popup.imagePlacement}
      content={{
        heading: popup.heading,
        bodyHtml: popup.bodyHtml,
        imageUrl: popup.imageUrl,
        imageAlt: popup.imageAlt,
        ctaLabel: popup.ctaLabel,
        ctaUrl: popup.ctaUrl
      }}
      style={{
        backgroundColor: popup.backgroundColor,
        textColor: popup.textColor,
        buttonBackgroundColor: popup.buttonBackgroundColor,
        buttonTextColor: popup.buttonTextColor,
        widthPx: popup.widthPx,
        cornerRadiusPx: popup.cornerRadiusPx
      }}
      onDismiss={() => {
        setIsOpen(false);
        postStat(popup.id, "dismissal");
      }}
      onCtaClick={() => postStat(popup.id, "click")}
    />
  );
}
