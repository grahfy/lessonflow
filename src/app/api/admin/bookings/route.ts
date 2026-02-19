import { NextRequest, NextResponse } from "next/server";

import { bookingColor, bookingRequestColor, getRecencyCutoff } from "@/lib/admin-calendar-events";
import { bookingRequestSchema, formatBookingAddress, generateRecurringStartDates, getBookingEnd } from "@/lib/booking-rules";
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
  const now = new Date();
  const recencyCutoff = getRecencyCutoff(now);

  const rows = await prisma.booking.findMany({
    where: {
      OR: [
        {
          status: "approved",
          startAt: {
            gte: range.start,
            lte: range.end
          }
        },
        {
          status: "cancelled",
          startAt: {
            gte: range.start,
            lte: range.end
          },
          updatedAt: {
            gte: recencyCutoff
          }
        }
      ]
    },
    orderBy: {
      startAt: "asc"
    }
  });

  const requestRows = await prisma.bookingRequest.findMany({
    where: {
      requestedStartAt: {
        gte: range.start,
        lte: range.end
      },
      OR: [
        {
          status: "pending"
        },
        {
          status: "rejected",
          updatedAt: {
            gte: recencyCutoff
          }
        }
      ]
    },
    orderBy: {
      requestedStartAt: "asc"
    }
  });

  const events = [
    ...rows.map((booking) => ({
      entityType: "booking" as const,
      id: booking.id,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      color: bookingColor(booking.status),
      title: booking.name,
      row: booking
    })),
    ...requestRows.map((requestRow) => ({
      entityType: "booking_request" as const,
      id: requestRow.id,
      startAt: requestRow.requestedStartAt.toISOString(),
      endAt: requestRow.requestedStartAt.toISOString(),
      status: requestRow.status,
      color: bookingRequestColor(requestRow.status),
      title: requestRow.name,
      row: requestRow
    }))
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return NextResponse.json({
    events,
    rows,
    requestRows,
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString()
    },
    now: now.toISOString(),
    recencyCutoff: recencyCutoff.toISOString()
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
        address: formatBookingAddress(parsed.data),
        unitNumber: parsed.data.unitNumber,
        houseNumber: parsed.data.houseNumber,
        streetName: parsed.data.streetName,
        streetType: parsed.data.streetType,
        suburb: parsed.data.suburb,
        state: parsed.data.state,
        postcode: parsed.data.postcode,
        lessonMode: parsed.data.lessonMode,
        skillLevel: parsed.data.skillLevel,
        lessonDuration: parsed.data.lessonDuration,
        customDurationMinutes: parsed.data.customDurationMinutes ?? null,
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
            address: formatBookingAddress(parsed.data),
            unitNumber: parsed.data.unitNumber,
            houseNumber: parsed.data.houseNumber,
            streetName: parsed.data.streetName,
            streetType: parsed.data.streetType,
            suburb: parsed.data.suburb,
            state: parsed.data.state,
            postcode: parsed.data.postcode,
            lessonMode: parsed.data.lessonMode,
            skillLevel: parsed.data.skillLevel,
            lessonDuration: parsed.data.lessonDuration,
            customDurationMinutes: parsed.data.customDurationMinutes ?? null,
            startAt: start,
            endAt: getBookingEnd(start, parsed.data.lessonDuration, parsed.data.customDurationMinutes),
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
        address: formatBookingAddress(parsed.data),
        unitNumber: parsed.data.unitNumber,
        houseNumber: parsed.data.houseNumber,
        streetName: parsed.data.streetName,
        streetType: parsed.data.streetType,
        suburb: parsed.data.suburb,
        state: parsed.data.state,
        postcode: parsed.data.postcode,
        lessonMode: parsed.data.lessonMode,
        skillLevel: parsed.data.skillLevel,
        lessonDuration: parsed.data.lessonDuration,
        customDurationMinutes: parsed.data.customDurationMinutes ?? null,
        startAt,
        endAt: getBookingEnd(startAt, parsed.data.lessonDuration, parsed.data.customDurationMinutes),
        timezone: "Australia/Melbourne",
        notes: parsed.data.notes,
        modifiedById: admin.id
      }
    });
  }

  return NextResponse.json({ ok: true });
}
