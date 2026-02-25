import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  auPhoneSchema,
  auPostcodeSchema,
  auStateSchema,
  formatBookingAddress,
  getBookingEnd,
  lessonDurationSchema,
  lessonModeSchema,
  skillLevelSchema
} from "@/lib/booking-rules";
import { sendCustomerBookingMovedEmail, sendCustomerBookingStatusEmail } from "@/lib/booking-events";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const editSchema = z.object({
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
  notes: z.string().trim().max(1000).nullable().optional()
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const action = String(body?.action || "");
    const { id } = await params;

    const existing = await prisma.booking.findUnique({
      where: { id }
    });
    if (!existing) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (action === "cancel") {
      const booking = await prisma.booking.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          modifiedById: admin.id
        }
      });

      await prisma.bookingAuditLog.create({
        data: {
          bookingId: id,
          actorId: admin.id,
          action: "cancelled"
        }
      });

      await sendCustomerBookingStatusEmail({
        email: booking.email,
        name: booking.name,
        status: "cancelled",
        when: booking.startAt
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "move") {
      const newStart = new Date(String(body?.newStartAt || ""));
      if (Number.isNaN(newStart.getTime())) {
        return NextResponse.json({ error: "Invalid new start date." }, { status: 400 });
      }
      const oldWhen = existing.startAt;

      await prisma.booking.update({
        where: { id },
        data: {
          startAt: newStart,
          endAt: getBookingEnd(newStart, existing.lessonDuration, existing.customDurationMinutes),
          modifiedById: admin.id
        }
      });

      await prisma.bookingAuditLog.create({
        data: {
          bookingId: id,
          actorId: admin.id,
          action: "moved",
          details: `Moved to ${newStart.toISOString()}`
        }
      });

      await sendCustomerBookingMovedEmail({
        email: existing.email,
        name: existing.name,
        oldWhen,
        newWhen: newStart
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "edit") {
      const parsed = editSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid edit payload.", details: parsed.error.flatten() }, { status: 400 });
      }

      const nextDuration = parsed.data.lessonDuration ?? existing.lessonDuration;
      const nextCustomDurationMinutes =
        parsed.data.customDurationMinutes === undefined
          ? existing.customDurationMinutes
          : parsed.data.customDurationMinutes;
      const nextName = parsed.data.name ?? existing.name;
      const nextEmail = parsed.data.email ?? existing.email;
      const nextPhone = parsed.data.phone ?? existing.phone;
      const nextUnitNumber =
        parsed.data.unitNumber === undefined
          ? existing.unitNumber
          : parsed.data.unitNumber && parsed.data.unitNumber.trim()
            ? parsed.data.unitNumber.trim()
            : null;
      const nextHouseNumber = parsed.data.houseNumber ?? existing.houseNumber;
      const nextStreetName = parsed.data.streetName ?? existing.streetName;
      const nextStreetType = parsed.data.streetType ?? existing.streetType;
      const nextSuburb = parsed.data.suburb ?? existing.suburb;
      const nextState = parsed.data.state ?? existing.state;
      const nextPostcode = parsed.data.postcode ?? existing.postcode;
      const nextAddress = formatBookingAddress({
        unitNumber: nextUnitNumber ?? undefined,
        houseNumber: nextHouseNumber,
        streetName: nextStreetName,
        streetType: nextStreetType,
        suburb: nextSuburb,
        state: nextState,
        postcode: nextPostcode
      });
      const nextNotes = parsed.data.notes === null ? null : parsed.data.notes ?? existing.notes;
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

      await prisma.booking.update({
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
          lessonMode: parsed.data.lessonMode ?? existing.lessonMode,
          skillLevel: parsed.data.skillLevel ?? existing.skillLevel,
          lessonDuration: nextDuration,
          customDurationMinutes: nextCustomDurationMinutes,
          endAt: getBookingEnd(existing.startAt, nextDuration, nextCustomDurationMinutes),
          notes: nextNotes,
          modifiedById: admin.id
        }
      });
      await prisma.bookingAuditLog.create({
        data: {
          bookingId: id,
          actorId: admin.id,
          action: "edited"
        }
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update booking.");
  }
}

/**
 * DELETE /api/admin/bookings/[id]
 * Permanently deletes a booking record from the database.
 * This is distinct from cancel - cancel marks status, delete removes entirely.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.booking.findUnique({
      where: { id }
    });
    if (!existing) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    await prisma.bookingAuditLog.deleteMany({
      where: { bookingId: id }
    });

    await prisma.booking.delete({
      where: { id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete booking.");
  }
}
