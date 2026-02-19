import { NextRequest, NextResponse } from "next/server";

import { generateRecurringStartDates, getBookingEnd } from "@/lib/booking-rules";
import { sendCustomerBookingStatusEmail } from "@/lib/booking-events";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function localTime(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  const { id } = await params;

  const bookingRequest = await prisma.bookingRequest.findUnique({
    where: { id }
  });

  if (!bookingRequest) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (action === "approve") {
    if (bookingRequest.status !== "pending") {
      return NextResponse.json({ error: "Only pending requests can be approved." }, { status: 400 });
    }

    if (bookingRequest.isRecurring && bookingRequest.recurrenceEndAt) {
      const series = await prisma.bookingSeries.create({
        data: {
          name: bookingRequest.name,
          email: bookingRequest.email,
          phone: bookingRequest.phone,
          address: bookingRequest.address,
          lessonMode: bookingRequest.lessonMode,
          skillLevel: bookingRequest.skillLevel,
          lessonDuration: bookingRequest.lessonDuration,
          dayOfWeek: bookingRequest.requestedStartAt.getDay(),
          startTimeLocal: localTime(bookingRequest.requestedStartAt),
          startDate: bookingRequest.requestedStartAt,
          recurrenceEndAt: bookingRequest.recurrenceEndAt,
          timezone: "Australia/Melbourne"
        }
      });

      const starts = generateRecurringStartDates({
        startAt: bookingRequest.requestedStartAt,
        recurrenceEndAt: bookingRequest.recurrenceEndAt
      });

      await prisma.$transaction(
        starts.map((startAt) =>
          prisma.booking.create({
            data: {
              name: bookingRequest.name,
              email: bookingRequest.email,
              phone: bookingRequest.phone,
              address: bookingRequest.address,
              lessonMode: bookingRequest.lessonMode,
              skillLevel: bookingRequest.skillLevel,
              lessonDuration: bookingRequest.lessonDuration,
              startAt,
              endAt: getBookingEnd(startAt, bookingRequest.lessonDuration),
              timezone: "Australia/Melbourne",
              requestId: bookingRequest.id,
              seriesId: series.id,
              modifiedById: admin.id
            }
          })
        )
      );
    } else {
      await prisma.booking.create({
        data: {
          name: bookingRequest.name,
          email: bookingRequest.email,
          phone: bookingRequest.phone,
          address: bookingRequest.address,
          lessonMode: bookingRequest.lessonMode,
          skillLevel: bookingRequest.skillLevel,
          lessonDuration: bookingRequest.lessonDuration,
          startAt: bookingRequest.requestedStartAt,
          endAt: getBookingEnd(bookingRequest.requestedStartAt, bookingRequest.lessonDuration),
          timezone: "Australia/Melbourne",
          requestId: bookingRequest.id,
          modifiedById: admin.id
        }
      });
    }

    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: {
        status: "approved",
        approvedById: admin.id
      }
    });

    await sendCustomerBookingStatusEmail({
      email: updated.email,
      name: updated.name,
      status: updated.status,
      when: updated.requestedStartAt
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: {
        status: "rejected",
        approvedById: admin.id
      }
    });

    await sendCustomerBookingStatusEmail({
      email: updated.email,
      name: updated.name,
      status: "cancelled",
      when: updated.requestedStartAt
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
