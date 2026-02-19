import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  auPhoneSchema,
  auPostcodeSchema,
  auStateSchema,
  formatBookingAddress,
  generateRecurringStartDates,
  getBookingEnd,
  lessonDurationSchema,
  lessonModeSchema,
  skillLevelSchema
} from "@/lib/booking-rules";
import { sendCustomerBookingStatusEmail } from "@/lib/booking-events";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const requestEditSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: auPhoneSchema.optional(),
  unitNumber: z.string().trim().max(30).optional().nullable(),
  houseNumber: z.string().trim().min(1).max(20).optional(),
  streetName: z.string().trim().min(2).max(120).optional(),
  streetType: z.string().trim().min(2).max(40).optional(),
  suburb: z.string().trim().min(2).max(80).optional(),
  state: auStateSchema.optional(),
  postcode: auPostcodeSchema.optional(),
  lessonMode: lessonModeSchema.optional(),
  skillLevel: skillLevelSchema.optional(),
  lessonDuration: lessonDurationSchema.optional(),
  customDurationMinutes: z.coerce.number().int().min(15).max(300).nullable().optional(),
  requestedStartAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceEndAt: z.string().datetime({ offset: true }).nullable().optional()
});

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
          unitNumber: bookingRequest.unitNumber,
          houseNumber: bookingRequest.houseNumber,
          streetName: bookingRequest.streetName,
          streetType: bookingRequest.streetType,
          suburb: bookingRequest.suburb,
          state: bookingRequest.state,
          postcode: bookingRequest.postcode,
          lessonMode: bookingRequest.lessonMode,
          skillLevel: bookingRequest.skillLevel,
          lessonDuration: bookingRequest.lessonDuration,
          customDurationMinutes: bookingRequest.customDurationMinutes,
          dayOfWeek: bookingRequest.requestedStartAt.getDay(),
          startTimeLocal: localTime(bookingRequest.requestedStartAt),
          startDate: bookingRequest.requestedStartAt,
          recurrenceEndAt: bookingRequest.recurrenceEndAt,
          timezone: "Australia/Melbourne",
          customerId: bookingRequest.customerId
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
              unitNumber: bookingRequest.unitNumber,
              houseNumber: bookingRequest.houseNumber,
              streetName: bookingRequest.streetName,
              streetType: bookingRequest.streetType,
              suburb: bookingRequest.suburb,
              state: bookingRequest.state,
              postcode: bookingRequest.postcode,
              lessonMode: bookingRequest.lessonMode,
              skillLevel: bookingRequest.skillLevel,
              lessonDuration: bookingRequest.lessonDuration,
              customDurationMinutes: bookingRequest.customDurationMinutes,
              startAt,
              endAt: getBookingEnd(startAt, bookingRequest.lessonDuration, bookingRequest.customDurationMinutes),
              timezone: "Australia/Melbourne",
              requestId: bookingRequest.id,
              seriesId: series.id,
              customerId: bookingRequest.customerId,
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
          unitNumber: bookingRequest.unitNumber,
          houseNumber: bookingRequest.houseNumber,
          streetName: bookingRequest.streetName,
          streetType: bookingRequest.streetType,
          suburb: bookingRequest.suburb,
          state: bookingRequest.state,
          postcode: bookingRequest.postcode,
          lessonMode: bookingRequest.lessonMode,
          skillLevel: bookingRequest.skillLevel,
          lessonDuration: bookingRequest.lessonDuration,
          customDurationMinutes: bookingRequest.customDurationMinutes,
          startAt: bookingRequest.requestedStartAt,
          endAt: getBookingEnd(
            bookingRequest.requestedStartAt,
            bookingRequest.lessonDuration,
            bookingRequest.customDurationMinutes
          ),
          timezone: "Australia/Melbourne",
          requestId: bookingRequest.id,
          customerId: bookingRequest.customerId,
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

  if (action === "cancel") {
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

  if (action === "move") {
    if (bookingRequest.status !== "pending") {
      return NextResponse.json({ error: "Only pending requests can be moved." }, { status: 400 });
    }

    const newStart = new Date(String(body?.newStartAt || ""));
    if (Number.isNaN(newStart.getTime())) {
      return NextResponse.json({ error: "Invalid new start date." }, { status: 400 });
    }

    await prisma.bookingRequest.update({
      where: { id },
      data: {
        requestedStartAt: newStart
      }
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "edit") {
    const parsed = requestEditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid edit payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    if (bookingRequest.status !== "pending") {
      return NextResponse.json({ error: "Only pending requests can be edited." }, { status: 400 });
    }

    const nextUnitNumber =
      parsed.data.unitNumber === undefined
        ? bookingRequest.unitNumber
        : parsed.data.unitNumber && parsed.data.unitNumber.trim()
          ? parsed.data.unitNumber.trim()
          : null;
    const nextName = parsed.data.name ?? bookingRequest.name;
    const nextEmail = parsed.data.email ?? bookingRequest.email;
    const nextPhone = parsed.data.phone ?? bookingRequest.phone;
    const nextHouseNumber = parsed.data.houseNumber ?? bookingRequest.houseNumber;
    const nextStreetName = parsed.data.streetName ?? bookingRequest.streetName;
    const nextStreetType = parsed.data.streetType ?? bookingRequest.streetType;
    const nextSuburb = parsed.data.suburb ?? bookingRequest.suburb;
    const nextState = parsed.data.state ?? bookingRequest.state;
    const nextPostcode = parsed.data.postcode ?? bookingRequest.postcode;
    const nextAddress = formatBookingAddress({
      unitNumber: nextUnitNumber ?? undefined,
      houseNumber: nextHouseNumber,
      streetName: nextStreetName,
      streetType: nextStreetType,
      suburb: nextSuburb,
      state: nextState,
      postcode: nextPostcode
    });
    const hasMandatory =
      !!nextName.trim() &&
      !!nextEmail.trim() &&
      !!nextHouseNumber.trim() &&
      !!nextStreetName.trim() &&
      !!nextStreetType.trim() &&
      !!nextSuburb.trim();
    const validPhone = auPhoneSchema.safeParse(nextPhone).success;
    const validState = auStateSchema.safeParse(nextState).success;
    const validPostcode = auPostcodeSchema.safeParse(nextPostcode).success;
    if (!hasMandatory || !validPhone || !validState || !validPostcode) {
      return NextResponse.json(
        {
          error:
            "Name, email, phone, house number, street name, street type, suburb, state and postcode are required with valid AU formats."
        },
        { status: 400 }
      );
    }

    await prisma.bookingRequest.update({
      where: { id },
      data: {
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
        address: nextAddress,
        unitNumber: nextUnitNumber,
        houseNumber: nextHouseNumber,
        streetName: nextStreetName,
        streetType: nextStreetType,
        suburb: nextSuburb,
        state: nextState,
        postcode: nextPostcode,
        lessonMode: parsed.data.lessonMode ?? bookingRequest.lessonMode,
        skillLevel: parsed.data.skillLevel ?? bookingRequest.skillLevel,
        lessonDuration: parsed.data.lessonDuration ?? bookingRequest.lessonDuration,
        customDurationMinutes:
          parsed.data.customDurationMinutes === undefined
            ? bookingRequest.customDurationMinutes
            : parsed.data.customDurationMinutes,
        requestedStartAt: parsed.data.requestedStartAt ? new Date(parsed.data.requestedStartAt) : bookingRequest.requestedStartAt,
        notes:
          parsed.data.notes === undefined
            ? bookingRequest.notes
            : parsed.data.notes === null
              ? null
              : parsed.data.notes,
        isRecurring: parsed.data.isRecurring ?? bookingRequest.isRecurring,
        recurrenceEndAt:
          parsed.data.recurrenceEndAt === undefined
            ? bookingRequest.recurrenceEndAt
            : parsed.data.recurrenceEndAt === null
              ? null
              : new Date(parsed.data.recurrenceEndAt)
      }
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
