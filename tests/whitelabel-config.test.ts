import { describe, it, expect, vi, afterEach } from "vitest";
import * as branding from "@/lib/branding";
import { buildPublicPageMetadata } from "@/lib/seo";

describe("Whitelabel Configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should use default branding when no env vars are set", () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_SUBJECT", "");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_LOCATION", "");
    vi.stubEnv("NEXT_PUBLIC_FAVICON_URL", "");
    expect(branding.getBranding().PUBLIC_BRAND_NAME).toBe("Melbourne Guitar School");
    expect(branding.getBranding().PRIMARY_SUBJECT).toBe("Guitar");
    expect(branding.getBranding().PRIMARY_LOCATION).toBe("Northcote");
    expect(branding.getBranding().FAVICON_URL).toBe("/icon.png");
  });

  it("should reflect custom branding from environment variables through runtime getters", () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "Sydney Piano Studio");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_SUBJECT", "Piano");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_LOCATION", "Sydney");
    vi.stubEnv("NEXT_PUBLIC_FAVICON_URL", "/images/piano-favicon.png");

    const customBranding = branding.getBranding();

    expect(customBranding.PUBLIC_BRAND_NAME).toBe("Sydney Piano Studio");
    expect(customBranding.PRIMARY_SUBJECT).toBe("Piano");
    expect(customBranding.PRIMARY_LOCATION).toBe("Sydney");
    expect(customBranding.FAVICON_URL).toBe("/images/piano-favicon.png");
    expect(branding.getSubjectLabel(customBranding.PRIMARY_SUBJECT)).toBe("Piano");
  });

  it("should build public metadata from the current runtime branding values", () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "Sydney Piano Studio");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_SUBJECT", "Piano");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_LOCATION", "Sydney");
    vi.stubEnv("NEXT_PUBLIC_LOGO_URL", "/images/piano-logo.png");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");

    const metadata = buildPublicPageMetadata({
      title: "{{BRAND_NAME}} | {{SUBJECT_LABEL}} Lessons in {{LOCATION}}",
      path: "/",
      description: "{{BRAND_NAME}} offers {{SUBJECT}} lessons in {{LOCATION}}."
    });

    // The title already contains the brand, so it is emitted as `absolute` to
    // opt out of the root layout's "%s | {brand}" template (avoids double-branding).
    expect(metadata.title).toEqual({ absolute: "Sydney Piano Studio | Piano Lessons in Sydney" });
    expect(metadata.description).toBe("Sydney Piano Studio offers Piano lessons in Sydney.");
    expect(metadata.openGraph?.siteName).toBe("Sydney Piano Studio");
    const firstImage = Array.isArray(metadata.openGraph?.images) ? metadata.openGraph.images[0] : undefined;
    const firstImageUrl = firstImage instanceof URL
      ? firstImage.toString()
      : typeof firstImage === "string"
        ? firstImage
        : firstImage?.url;
    expect(firstImageUrl).toBe("https://example.com/images/piano-logo.png");
  });
});
