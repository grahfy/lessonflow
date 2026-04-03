import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_COOKIE_CONSENT_STORAGE_KEY,
  hasPublicCookieConsentForOptionalFeatures,
  readPublicCookieConsent,
  writePublicCookieConsent
} from "@/lib/public-cookie-consent";

describe("public-cookie-consent", () => {
  it("returns unknown when no browser storage is available", () => {
    expect(readPublicCookieConsent()).toBe("unknown");
    expect(hasPublicCookieConsentForOptionalFeatures()).toBe(false);
  });

  it("reads accepted and declined values from local storage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        }
      }
    });

    writePublicCookieConsent("accepted");
    expect(readPublicCookieConsent()).toBe("accepted");
    expect(hasPublicCookieConsentForOptionalFeatures()).toBe(true);

    writePublicCookieConsent("declined");
    expect(readPublicCookieConsent()).toBe("declined");
    expect(hasPublicCookieConsentForOptionalFeatures()).toBe(false);

    expect(storage.get(PUBLIC_COOKIE_CONSENT_STORAGE_KEY)).toBe("declined");
    vi.unstubAllGlobals();
  });

  it("treats invalid stored values as unknown", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "invalid",
        setItem: () => undefined
      }
    });

    expect(readPublicCookieConsent()).toBe("unknown");
    expect(hasPublicCookieConsentForOptionalFeatures()).toBe(false);
    vi.unstubAllGlobals();
  });
});
