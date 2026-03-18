import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/geo/route";
import { prisma } from "@/lib/db";
import { DEFAULT_GEOBLOCKING_SETTINGS_ID } from "@/lib/geoblocking-settings";

describe("api-geo", () => {
  beforeEach(async () => {
    await prisma.geoblockingSettings.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("returns allowed for unrestricted defaults", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/geo", {
        headers: {
          "x-vercel-ip-country": "US"
        }
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      country: string | null;
      allowed: boolean;
      reason: string;
    };

    expect(body.country).toBe("US");
    expect(body.allowed).toBe(true);
    expect(body.reason).toBe("allowlist");
  });

  it("returns blocked when the country is outside the allowlist", async () => {
    await prisma.geoblockingSettings.create({
      data: {
        id: DEFAULT_GEOBLOCKING_SETTINGS_ID,
        allowedCountries: ["AU"],
        unknownCountryMode: "allow"
      }
    });

    const response = await GET(
      new NextRequest("http://localhost/api/geo", {
        headers: {
          "x-vercel-ip-country": "US"
        }
      })
    );

    const body = (await response.json()) as {
      country: string | null;
      allowed: boolean;
      reason: string;
    };

    expect(body.country).toBe("US");
    expect(body.allowed).toBe(false);
    expect(body.reason).toBe("blocked_country");
  });

  it("returns unknown blocked when lookup fails and fallback policy is block", async () => {
    await prisma.geoblockingSettings.create({
      data: {
        id: DEFAULT_GEOBLOCKING_SETTINGS_ID,
        allowedCountries: ["AU"],
        unknownCountryMode: "block"
      }
    });

    const response = await GET(new NextRequest("http://localhost/api/geo"));
    const body = (await response.json()) as {
      country: string | null;
      allowed: boolean;
      reason: string;
    };

    expect(body.country).toBeNull();
    expect(body.allowed).toBe(false);
    expect(body.reason).toBe("unknown_blocked");
  });
});
