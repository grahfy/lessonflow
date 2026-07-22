import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { deriveAvailableSlots } from "@/lib/booking/availability";
import { getBusinessHours, toWeeklyBusinessHours } from "@/lib/booking/business-hours";
import { prisma } from "@/lib/db";
import { getActiveLessonPricingMap } from "@/lib/lesson-pricing";
import { requireStudentFromRequest } from "@/lib/student-portal/session";
import { APP_TIMEZONE, dateTimeLocalToDate } from "@/lib/time";

/**
 * `date` is a civil date (`YYYY-MM-DD`) the student picked, NOT an instant:
 * "Tuesday" means Tuesday in the school's timezone, so it is resolved against
 * `APP_TIMEZONE` rather than parsed as UTC. `durationMinutes` is optional
 * because the picker asks for slots before the student has chosen a length.
 */
const bookingSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be a YYYY-MM-DD calendar date."),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional()
});

/** Last-resort lesson length when the owner has not configured any pricing. */
const FALLBACK_DURATION_MINUTES = 60;

/**
 * Free/busy slots for the student booking tab (AC-46, AC-47, AC-48, AC-51, AC-52).
 *
 * `GET ?date=YYYY-MM-DD&durationMinutes=n` →
 * `{ teacher: { id, name } | null, durationOptions: number[], slots: [{ startAt, endAt }] }`
 *
 * Availability is DERIVED, never stored: business hours minus the teacher's
 * existing non-cancelled bookings, via `deriveAvailableSlots`. All of the
 * timezone, DST, grid-alignment and minimum-notice rules live there; this
 * handler only loads the inputs.
 *
 * AC-46/AC-47: the teacher is `Customer.primaryTeacherId` and nothing else —
 * no auto-assignment fallback here, because showing a student the availability
 * of a teacher they are not assigned to would be a lie. An unassigned student
 * gets `teacher: null` and no slots, which is a legitimate state the UI
 * renders a message for, not an error.
 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bookingSlotsQuerySchema.safeParse({
      date: request.nextUrl.searchParams.get("date") ?? undefined,
      durationMinutes: request.nextUrl.searchParams.get("durationMinutes") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // AC-52: the bookable lengths are whatever the owner currently sells.
    const durationOptions = [...(await getActiveLessonPricingMap()).keys()].sort((a, b) => a - b);
    const durationMinutes =
      parsed.data.durationMinutes ?? durationOptions[0] ?? FALLBACK_DURATION_MINUTES;
    if (durationOptions.length > 0 && !durationOptions.includes(durationMinutes)) {
      return NextResponse.json(
        { error: "That lesson length is not currently offered." },
        { status: 400 }
      );
    }

    // Civil day → half-open instant window. The end is the NEXT civil day's
    // midnight rather than start + 24h, because a DST day is 23 or 25 hours
    // long. Midnight itself can be a non-existent wall-clock time on a
    // spring-forward date, so an unresolvable boundary is a client error
    // rather than a crash.
    const [year, month, day] = parsed.data.date.split("-").map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    const rangeStart = dateTimeLocalToDate(`${parsed.data.date}T00:00`, APP_TIMEZONE);
    const rangeEnd = dateTimeLocalToDate(`${nextDate}T00:00`, APP_TIMEZONE);
    if (!rangeStart || !rangeEnd) {
      return NextResponse.json({ error: "Unsupported calendar date." }, { status: 400 });
    }

    const teacher = student.primaryTeacherId
      ? await prisma.adminUser.findUnique({
          where: { id: student.primaryTeacherId },
          select: { id: true, displayName: true }
        })
      : null;

    if (!teacher) {
      return NextResponse.json({ teacher: null, durationOptions, slots: [] });
    }

    const [businessHours, bookings] = await Promise.all([
      getBusinessHours(),
      // `status` is `approved | cancelled`; only cancelled lessons free their
      // slot back up. The window catches bookings that start the previous day
      // and run into this one.
      prisma.booking.findMany({
        where: {
          assignedTeacherId: teacher.id,
          status: { not: "cancelled" },
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart }
        },
        select: { id: true, startAt: true, endAt: true }
      })
    ]);

    const slots = deriveAvailableSlots({
      rangeStart,
      rangeEnd,
      businessHours: toWeeklyBusinessHours(businessHours.weekdays),
      durationMinutes,
      bookings,
      now: new Date(),
      slotMinutes: businessHours.slotGranularityMinutes,
      // AC-51: notice comes from the owner's configuration, never a constant.
      minimumNoticeHours: businessHours.minimumNoticeHours
    });

    return NextResponse.json({
      teacher: { id: teacher.id, name: teacher.displayName },
      durationOptions,
      slots: slots.map((slot) => ({
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString()
      }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load available lesson times.");
  }
}
