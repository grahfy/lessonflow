import { describe, it, expect, vi, afterEach } from "vitest";
import * as branding from "@/lib/branding";

describe("Whitelabel Configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should use default branding when no env vars are set", () => {
    expect(branding.PUBLIC_BRAND_NAME).toBe("Melbourne Guitar School");
    expect(branding.PRIMARY_SUBJECT).toBe("Guitar");
    expect(branding.PRIMARY_LOCATION).toBe("Northcote");
  });

  it("should reflect custom branding from environment variables", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "Sydney Piano Studio");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_SUBJECT", "Piano");
    vi.stubEnv("NEXT_PUBLIC_PRIMARY_LOCATION", "Sydney");

    // We need to re-import or use a getter because constants are evaluated at load time.
    const customBranding = await import("@/lib/branding?test=" + Date.now());
    
    expect(customBranding.PUBLIC_BRAND_NAME).toBe("Sydney Piano Studio");
    expect(customBranding.PRIMARY_SUBJECT).toBe("Piano");
    expect(customBranding.PRIMARY_LOCATION).toBe("Sydney");
  });
});
