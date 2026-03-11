import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { bookingColor, bookingRequestColor, getRecencyCutoff } from "@/lib/admin-calendar-events";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { getCalendarRange } from "@/lib/calendar-range";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/admin/bookings/route";

describe("admin-bookings", () => {
  beforeEach(async () => {
    // NOTE: The bookings calendar reads both bookings and booking requests into
    // one unified event list, so both tables must be reset between tests.
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

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

  it("computes a 48-hour recency cutoff", () => {
    const now = new Date("2026-02-20T10:00:00.000Z");
    const cutoff = getRecencyCutoff(now);
    expect(cutoff.toISOString()).toBe("2026-02-18T10:00:00.000Z");
  });

  it("maps booking and request statuses to calendar colors", () => {
    expect(bookingColor("approved")).toBe("green");
    expect(bookingColor("cancelled")).toBe("slate");
    expect(bookingRequestColor("pending")).toBe("yellow");
    expect(bookingRequestColor("rejected")).toBe("red");
  });

  it("returns unified events and only includes pending requests inside selected range", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookieHeader = `${getSessionCookieName()}=${token}`;

    await prisma.booking.create({
      data: {
        name: "In Range Booking",
        email: "book@example.com",
        phone: "0400-000-000",
        address: "12 Lane",
        houseNumber: "12",
        streetName: "Lane",
        streetType: "St",
        suburb: "Fitzroy",
        state: "VIC",
        postcode: "3065",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-04-14T10:00:00.000Z"),
        endAt: new Date("2026-04-14T11:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    await prisma.bookingRequest.create({
      data: {
        name: "Pending In Range",
        email: "pending.in@example.com",
        phone: "0400-000-001",
        address: "22 St",
        houseNumber: "22",
        streetName: "Smith",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-04-15T08:00:00.000Z"),
        status: "pending"
      }
    });

    await prisma.bookingRequest.create({
      data: {
        name: "Pending Out Of Range",
        email: "pending.out@example.com",
        phone: "0400-000-002",
        address: "23 St",
        houseNumber: "23",
        streetName: "Jones",
        streetType: "St",
        suburb: "Richmond",
        state: "VIC",
        postcode: "3121",
        lessonMode: "video",
        skillLevel: "advanced",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-08-15T08:00:00.000Z"),
        status: "pending"
      }
    });

    const req = new NextRequest("http://localhost/api/admin/bookings?view=week&date=2026-04-14", {
      headers: {
        cookie: cookieHeader
      }
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      events: Array<{ title: string; color: string }>;
    };
    const titles = body.events.map((event) => event.title);
    // RATIONALE: Pending requests are only shown when they fall inside the
    // selected range, while confirmed bookings always contribute real events.
    expect(titles).toContain("In Range Booking");
    expect(titles).toContain("Pending In Range");
    expect(titles).not.toContain("Pending Out Of Range");
    expect(body.events.find((event) => event.title === "In Range Booking")?.color).toBe("green");
    expect(body.events.find((event) => event.title === "Pending In Range")?.color).toBe("yellow");
  });
});
