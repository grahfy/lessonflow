import { beforeEach, describe, expect, it } from "vitest";

import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import {
  evaluatePublicGeoblocking,
  getGeoblockingSettingsState,
  saveGeoblockingSettings
} from "@/lib/geoblocking-settings";

describe("geoblocking-settings", () => {
  beforeEach(async () => {
    await prisma.geoblockingSettings.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("returns unrestricted defaults before setup without persisting a row", async () => {
    const state = await getGeoblockingSettingsState();

    expect(state.allowedCountries).toContain("AU");
    expect(state.allowedCountries).toContain("US");
    expect(state.allowedCountries.length).toBeGreaterThan(200);
    expect(state.unknownCountryMode).toBe("allow");

    const stored = await prisma.geoblockingSettings.count();
    expect(stored).toBe(0);
  });

  it("lazily seeds unrestricted settings for completed installs", async () => {
    await ensureOwnerAdmin();

    const state = await getGeoblockingSettingsState();
    expect(state.allowedCountries.length).toBeGreaterThan(200);
    expect(state.unknownCountryMode).toBe("allow");
    expect(await prisma.geoblockingSettings.count()).toBe(1);
  });

  it("evaluates blocked and unknown-country policies from saved settings", async () => {
    await saveGeoblockingSettings({
      allowedCountries: ["AU", "NZ"],
      unknownCountryMode: "block"
    });

    const blocked = await evaluatePublicGeoblocking(
      new Headers({
        "x-vercel-ip-country": "US"
      })
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("blocked_country");
    expect(blocked.country).toBe("US");

    const unknown = await evaluatePublicGeoblocking(new Headers());
    expect(unknown.allowed).toBe(false);
    expect(unknown.reason).toBe("unknown_blocked");
    expect(unknown.country).toBeNull();
  });
});
