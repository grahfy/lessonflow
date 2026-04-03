"use client";

import { useEffect, useState } from "react";

import { TweenLink } from "@/components/motion/tween-link";
import {
  type PublicCookieConsent,
  readPublicCookieConsent,
  writePublicCookieConsent
} from "@/lib/public-cookie-consent";

/**
 * Shows a first-visit consent choice for public pages and persists the decision locally.
 */
export function PublicCookieConsentBanner() {
  const [consent, setConsent] = useState<PublicCookieConsent>("unknown");
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setConsent(readPublicCookieConsent());
    setHasHydrated(true);
  }, []);

  function handleConsent(value: Exclude<PublicCookieConsent, "unknown">) {
    writePublicCookieConsent(value);
    setConsent(value);
  }

  if (!hasHydrated || consent !== "unknown") {
    return null;
  }

  return (
    <aside
      className="cookie-consent-banner"
      aria-live="polite"
      aria-label="Cookie consent"
      data-motion-item="cookie-consent-banner"
    >
      <div className="cookie-consent-copy">
        <p className="cookie-consent-title">Cookie preferences</p>
        <p className="cookie-consent-text">
          We use essential site storage to keep the website working. You can accept or decline any future
          optional cookies, and you can review how data is handled in our{" "}
          <TweenLink href="/privacy">Privacy Policy</TweenLink>.
        </p>
      </div>

      <div className="cookie-consent-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => handleConsent("declined")}
        >
          Decline
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => handleConsent("accepted")}
        >
          Accept
        </button>
      </div>
    </aside>
  );
}
