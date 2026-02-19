import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { getCalendarRange } from "@/lib/calendar-range";
import { GET } from "@/app/api/admin/bookings/route";

describe("admin-bookings", () => {
  it("computes date ranges for day/week/month views", () => {
    const day = getCalendarRange("day", "2026-04-14");
    const week = getCalendarRange("week", "2026-04-14");
    const month = getCalendarRange("month", "2026-04-14");

    expect(day.start <= day.end).toBe(true);
    expect(week.start <= week.end).toBe(true);
    expect(month.start <= month.end).toBe(true);
  });

  it("rejects unauthenticated admin bookings fetch", async () => {
    const req = new NextRequest("http://localhost/api/admin/bookings?view=week&date=2026-04-14");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
