import { NextRequest, NextResponse } from "next/server";

import { bookingRequestSchema, generateRecurringStartDates, getBookingEnd } from "@/lib/booking-rules";
import { getCalendarRange } from "@/lib/calendar-range";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewRaw = request.nextUrl.searchParams.get("view") || "week";
  const date = request.nextUrl.searchParams.get("date") || undefined;
  const view = viewRaw === "day" || viewRaw === "month" ? viewRaw : "week";
  const range = getCalendarRange(view, date);

  const rows = await prisma.booking.findMany({
    where: {
      startAt: {
        gte: range.start,
        lte: range.end
      }
    },
    orderBy: {
      startAt: "asc"
    }
  });

  return NextResponse.json({
    rows,
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString()
    }
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const startAt = new Date(parsed.data.requestedStartAt);
  if (parsed.data.isRecurring && parsed.data.recurrenceEndAt) {
    const endAt = new Date(parsed.data.recurrenceEndAt);
    const starts = generateRecurringStartDates({ startAt, recurrenceEndAt: endAt });

    const series = await prisma.bookingSeries.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        address: parsed.data.address,
        lessonMode: parsed.data.lessonMode,
        skillLevel: parsed.data.skillLevel,
        lessonDuration: parsed.data.lessonDuration,
        dayOfWeek: startAt.getDay(),
        startTimeLocal: startAt.toISOString().slice(11, 16),
        startDate: startAt,
        recurrenceEndAt: endAt,
        timezone: "Australia/Melbourne"
      }
    });

    await prisma.$transaction(
      starts.map((start) =>
        prisma.booking.create({
          data: {
            name: parsed.data.name,
            email: parsed.data.email,
            phone: parsed.data.phone,
            address: parsed.data.address,
            lessonMode: parsed.data.lessonMode,
            skillLevel: parsed.data.skillLevel,
            lessonDuration: parsed.data.lessonDuration,
            startAt: start,
            endAt: getBookingEnd(start, parsed.data.lessonDuration),
            timezone: "Australia/Melbourne",
            notes: parsed.data.notes,
            seriesId: series.id,
            modifiedById: admin.id
          }
        })
      )
    );
  } else {
    await prisma.booking.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        address: parsed.data.address,
        lessonMode: parsed.data.lessonMode,
        skillLevel: parsed.data.skillLevel,
        lessonDuration: parsed.data.lessonDuration,
        startAt,
        endAt: getBookingEnd(startAt, parsed.data.lessonDuration),
        timezone: "Australia/Melbourne",
        notes: parsed.data.notes,
        modifiedById: admin.id
      }
    });
  }

  return NextResponse.json({ ok: true });
}
