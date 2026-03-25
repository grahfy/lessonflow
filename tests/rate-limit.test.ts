import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { getRequestIp } from "@/lib/rate-limit";

describe("rate-limit", () => {
  it("prefers x-real-ip when present", () => {
    const request = new NextRequest("http://localhost/api/admin/login", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.5, 203.0.113.20"
      }
    });

    expect(getRequestIp(request)).toBe("203.0.113.10");
  });

  it("falls back to the first x-forwarded-for hop when x-real-ip is missing", () => {
    const request = new NextRequest("http://localhost/api/admin/login", {
      headers: {
        "x-forwarded-for": "198.51.100.5, 203.0.113.20"
      }
    });

    expect(getRequestIp(request)).toBe("198.51.100.5");
  });

  it("returns unknown when no proxy headers are present", () => {
    const request = new NextRequest("http://localhost/api/admin/login");

    expect(getRequestIp(request)).toBe("unknown");
  });
});
