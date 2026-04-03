export type PublicCookieConsent = "unknown" | "accepted" | "declined";

export const PUBLIC_COOKIE_CONSENT_STORAGE_KEY = "mgs_public_cookie_consent";

const VALID_PUBLIC_COOKIE_CONSENT_VALUES = new Set<PublicCookieConsent>([
  "unknown",
  "accepted",
  "declined"
]);

/**
 * Reads the visitor's persisted public-site consent preference.
 */
export function readPublicCookieConsent(): PublicCookieConsent {
  if (typeof window === "undefined") {
    return "unknown";
  }

  const storedValue = window.localStorage.getItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY);
  if (!storedValue || !VALID_PUBLIC_COOKIE_CONSENT_VALUES.has(storedValue as PublicCookieConsent)) {
    return "unknown";
  }

  return storedValue as PublicCookieConsent;
}

/**
 * Persists the visitor's public-site consent preference.
 */
export function writePublicCookieConsent(value: Exclude<PublicCookieConsent, "unknown">): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY, value);
}

/**
 * Centralized gate for any future optional-cookie or analytics features.
 */
export function hasPublicCookieConsentForOptionalFeatures(): boolean {
  return readPublicCookieConsent() === "accepted";
}
