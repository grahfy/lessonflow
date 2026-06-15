import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageAssignedTeacher, isOwner } from "@/lib/admin/permissions";
import { resolveAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import {
  auPhoneSchema,
  auPostcodeSchema,
  auStateSchema,
  formatBookingAddress,
  getBookingEnd,
  getDurationMinutes,
  lessonDurationSchema,
  lessonModeSchema,
  nullableOptionalCustomDurationMinutesSchema,
  skillLevelSchema
} from "@/lib/booking-rules";
import { sendCustomerBookingMovedEmail, sendCustomerBookingStatusEmail } from "@/lib/booking-events";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getActiveLessonPricingMap } from "@/lib/lesson-pricing";
import { reconcileBookingNoteImages } from "@/lib/note-images";
import { enqueueStorageCleanupTasks, processStorageCleanupTasks } from "@/lib/storage-cleanup";
import { tiptapJsonToPlainText } from "@/lib/tiptap-utils";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const editSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
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
  customDurationMinutes: nullableOptionalCustomDurationMinutesSchema,
  assignedTeacherId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  notesContent: z.record(z.unknown()).nullable().optional()
});

// Attendance is clearable: an explicit null resets the lesson back to un-recorded.
const setAttendanceSchema = z.object({
  attendanceStatus: z.enum(["attended", "no_show"]).nullable()
});

/**
 * Admin booking mutation route used by the bookings dialog.
 *
 * The client sends an `action` discriminator so edit/move/cancel share a single endpoint while the
 * server retains action-specific validation and side effects (audit logs + customer emails).
 */
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
    if (!canManageAssignedTeacher(admin, existing.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

      // Reuse the customer-facing booking status template for cancellation notices.
      // Audit log entry is handled by the event wrapper.
      const deliveryResult = await sendCustomerBookingStatusEmail({
        email: booking.email,
        name: booking.name,
        status: "cancelled",
        when: booking.startAt,
        audit: {
          bookingId: id,
          actorId: admin.id,
          action: "cancelled"
        }
      });

      if (deliveryResult.status !== "sent") {
        return NextResponse.json(
          {
            ok: true,
            partial: true,
            warning:
              deliveryResult.status === "suppressed"
                ? "Booking was cancelled, but automated customer booking-update emails are disabled in admin settings."
                : deliveryResult.error || "Booking was cancelled, but the notification email could not be delivered.",
            deliveryStatus: deliveryResult.status
          },
          { status: 200 }
        );
      }

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

      // Send after the DB write succeeds so the customer email reflects persisted booking times.
      // Audit log entry is handled by the event wrapper.
      const deliveryResult = await sendCustomerBookingMovedEmail({
        email: existing.email,
        name: existing.name,
        oldWhen,
        newWhen: newStart,
        audit: {
          bookingId: id,
          actorId: admin.id,
          action: "moved",
          details: `Moved to ${newStart.toISOString()}`
        }
      });

      if (deliveryResult.status !== "sent") {
        return NextResponse.json(
          {
            ok: true,
            partial: true,
            warning:
              deliveryResult.status === "suppressed"
                ? "Booking was moved, but automated customer booking-update emails are disabled in admin settings."
                : deliveryResult.error || "Booking was moved, but the notification email could not be delivered.",
            deliveryStatus: deliveryResult.status
          },
          { status: 200 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "edit") {
      const parsed = editSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid edit payload.", details: parsed.error.flatten() }, { status: 400 });
      }

      const nextAssignedTeacherId =
        parsed.data.assignedTeacherId === undefined
          ? existing.assignedTeacherId
          : await resolveAssignedTeacherId({
              db: prisma,
              actor: admin,
              requestedAssignedTeacherId: parsed.data.assignedTeacherId,
              fallbackTeacherId: parsed.data.assignedTeacherId === null ? null : existing.assignedTeacherId
            });

      // Derive the full next-state payload server-side so partial edits preserve required fields
      // and computed values (address string, end time) stay consistent.
      const nextDuration = parsed.data.lessonDuration ?? existing.lessonDuration;
      const nextCustomDurationMinutes =
        parsed.data.customDurationMinutes === undefined
          ? existing.customDurationMinutes
          : parsed.data.customDurationMinutes;
      const nextDurationMinutes = getDurationMinutes(nextDuration, nextCustomDurationMinutes);
      const lessonPricingMap = await getActiveLessonPricingMap();
      if (lessonPricingMap.size > 0 && !lessonPricingMap.has(nextDurationMinutes)) {
        return NextResponse.json(
          { error: `No active lesson pricing is configured for ${nextDurationMinutes} minute lessons.` },
          { status: 400 }
        );
      }
      const nextFirstName = parsed.data.firstName ?? existing.firstName;
      const nextLastName = parsed.data.lastName ?? existing.lastName;
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
      // When notesContent (TipTap JSON) is provided, derive plain-text notes from it.
      // This keeps the text column in sync for search, email snippets, and backward compat.
      const nextNotesContent =
        parsed.data.notesContent === null
          ? null
          : parsed.data.notesContent ?? existing.notesContent;
      const nextNotes =
        nextNotesContent != null
          ? tiptapJsonToPlainText(nextNotesContent) || null
          : parsed.data.notes === null
            ? null
            : parsed.data.notes ?? existing.notes;
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

      const cleanupTaskIds = await prisma.$transaction(async (tx) => {
        const staleNoteImageStorageKeys = await reconcileBookingNoteImages({
          tx,
          bookingId: id,
          notesContent: nextNotesContent,
        });

        await tx.booking.update({
          where: { id },
          data: {
            firstName: nextFirstName,
            lastName: nextLastName,
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
            ...(isOwner(admin) ? { assignedTeacherId: nextAssignedTeacherId } : {}),
            notes: nextNotes,
            notesContent:
              nextNotesContent === null
                ? Prisma.JsonNull
                : nextNotesContent != null
                  ? (nextNotesContent as Prisma.InputJsonValue)
                  : undefined,
            modifiedById: admin.id
          }
        });
        await tx.bookingAuditLog.create({
          data: {
            bookingId: id,
            actorId: admin.id,
            action: "edited"
          }
        });

        return enqueueStorageCleanupTasks({
          db: tx,
          tasks: staleNoteImageStorageKeys.map((storageKey) => ({
            storageKey,
            scope: "booking_note_image",
            entityId: id,
          })),
        });
      });

      await processStorageCleanupTasks({
        db: prisma,
        taskIds: cleanupTaskIds,
        maxTasks: cleanupTaskIds.length || 25,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "set_attendance") {
      // Attendance can only be recorded for confirmed lessons that have already started.
      if (existing.status !== "approved") {
        return NextResponse.json(
          { error: "Attendance can only be set on confirmed bookings." },
          { status: 400 }
        );
      }
      if (existing.startAt.getTime() >= Date.now()) {
        return NextResponse.json(
          { error: "Attendance can only be set after the lesson has started." },
          { status: 400 }
        );
      }

      const parsed = setAttendanceSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid attendance payload.", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const nextAttendanceStatus = parsed.data.attendanceStatus;
      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id },
          data: {
            attendanceStatus: nextAttendanceStatus,
            // Clearing attendance also resets the marked metadata so the lesson reads as un-recorded.
            attendanceMarkedAt: nextAttendanceStatus === null ? null : now,
            attendanceMarkedById: nextAttendanceStatus === null ? null : admin.id,
            modifiedById: admin.id
          }
        });
        await tx.bookingAuditLog.create({
          data: {
            bookingId: id,
            actorId: admin.id,
            action: "attendance_marked",
            details:
              nextAttendanceStatus === null
                ? "Attendance cleared"
                : `Attendance set to ${nextAttendanceStatus}`
          }
        });
      });

      return NextResponse.json({ ok: true, attendanceStatus: nextAttendanceStatus });
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
    if (!canManageAssignedTeacher(admin, existing.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete dependent audit rows first to satisfy FK constraints before removing the booking.
    await prisma.$transaction(async (tx) => {
      await tx.bookingAuditLog.deleteMany({
        where: { bookingId: id }
      });

      await tx.booking.delete({
        where: { id }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete booking.");
  }
}
