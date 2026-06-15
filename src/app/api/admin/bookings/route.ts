/**
 * Admin Bookings API Route
 * 
 * Handles reading calendar events and creating manual bookings for administrators.
 * This route is the backbone of the Admin Calendar UI.
 */

import { APP_TIMEZONE, toTimeKey } from "@/lib/time";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

import { bookingColor, bookingRequestColor, getRecencyCutoff } from "@/lib/admin-calendar-events";
import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { ensureCustomerPrimaryTeacher, resolveAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { adminManualBookingSchema, formatBookingAddress, generateRecurringStartDates, getBookingEnd, getDurationMinutes } from "@/lib/booking-rules";
import { customerSnapshotFromInput, normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { getCalendarRange } from "@/lib/calendar-range";
import { log } from "@/lib/observability";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { findActiveInvoiceLinksForBookingIds } from "@/lib/invoices/booking-links";
import { getActiveLessonPricingMap } from "@/lib/lesson-pricing";
import { ensurePortalCredentialForCustomer } from "@/lib/student-portal/credentials";
import { tiptapJsonToPlainText } from "@/lib/tiptap-utils";

/**
 * Enhanced schema for manual bookings created by an admin.
 * Includes additional fields for binding to existing customers or choosing
 * resolution strategies when a possible duplicate is detected.
 */
const manualBookingSchema = adminManualBookingSchema.and(
  z.object({
    customerId: z.string().trim().min(1).optional(),
    assignedTeacherId: z.string().trim().min(1).nullable().optional(),
    matchResolution: z.enum(["use_existing", "create_new", "update_existing"]).optional(),
    updateCustomerFromBooking: z.boolean().optional()
  })
);

type ManualBookingInput = z.infer<typeof manualBookingSchema>;

/**
 * Safety cap on calendar rows returned per entity in the GET handler.
 * RATIONALE: The single Node process runs under a 1G memory cap, so even though
 * the calendar is constrained by a date window we add an explicit `take` bound
 * to guarantee a pathological window can never load an unbounded result set.
 */
const MAX_CALENDAR_ROWS = 2000;

/**
 * Hard ceiling on the calendar window (in days). A request whose computed range
 * exceeds this is rejected so the client cannot ask for an effectively unbounded
 * span. The widest legitimate view is "year", which is comfortably under this.
 */
const MAX_CALENDAR_RANGE_DAYS = 400;

/**
 * Internal helper to create a new customer record from booking data.
 */
type DbClient = Prisma.TransactionClient | typeof prisma;

async function createCustomerFromBooking(db: DbClient, input: ManualBookingInput, primaryTeacherId?: string | null) {
  return db.customer.create({
    data: {
      ...customerSnapshotFromInput({
        firstName: input.firstName,
        lastName: input.lastName,
        name: input.name,
        email: input.email,
        phone: input.phone,
        skillLevel: input.skillLevel,
        lessonMode: input.lessonMode,
        unitNumber: input.unitNumber ?? undefined,
        houseNumber: input.houseNumber,
        streetName: input.streetName,
        streetType: input.streetType,
        suburb: input.suburb,
        state: input.state,
        postcode: input.postcode
      }),
      ...(primaryTeacherId ? { primaryTeacherId } : {})
    }
  });
}

/**
 * Internal helper to update an existing customer from booking data.
 * Used when an admin explicitly chooses to sync new details to the master profile.
 */
async function updateCustomerFromBooking(db: DbClient, id: string, input: ManualBookingInput) {
  return db.customer.update({
    where: { id },
    data: customerSnapshotFromInput({
      firstName: input.firstName,
      lastName: input.lastName,
      name: input.name,
      email: input.email,
      phone: input.phone,
      skillLevel: input.skillLevel,
      lessonMode: input.lessonMode,
      unitNumber: input.unitNumber ?? undefined,
      houseNumber: input.houseNumber,
      streetName: input.streetName,
      streetType: input.streetType,
      suburb: input.suburb,
      state: input.state,
      postcode: input.postcode
    })
  });
}

/**
 * GET: Fetches calendar events (Bookings and Booking Requests) for a given range.
 * 
 * LOGIC:
 * 1. Determines the visible calendar window (week, month, etc.)
 * 2. Fetches 'approved' bookings.
 * 3. Fetches 'cancelled' bookings updated within the recency cutoff (so they don't vanish immediately).
 * 4. Fetches 'pending' booking requests.
 * 5. Maps both entities into a unified "event" structure for the Radix/FullCalendar UI.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const viewRaw = request.nextUrl.searchParams.get("view") || "week";
    const date = request.nextUrl.searchParams.get("date") || undefined;
    const view = viewRaw === "day" || viewRaw === "month" || viewRaw === "year" ? viewRaw : "week";
    const range = getCalendarRange(view, date);
    
    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
      return NextResponse.json({ error: "Invalid calendar date." }, { status: 400 });
    }

    // Clamp the requested window: reject spans wider than the supported views so a
    // crafted `date`/`view` combination can never request an unbounded range.
    const rangeDays = (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_CALENDAR_RANGE_DAYS) {
      return NextResponse.json({ error: "Calendar range is too large." }, { status: 400 });
    }

    const now = new Date();
    const recencyCutoff = getRecencyCutoff(now);

    // Fetch approved and recently cancelled bookings
    const rows = await prisma.booking.findMany({
      where: {
        OR: [
          {
            status: "approved",
            startAt: { gte: range.start, lte: range.end },
            ...(admin.role === "teacher" ? { assignedTeacherId: admin.id } : {})
          },
          {
            status: "cancelled",
            startAt: { gte: range.start, lte: range.end },
            updatedAt: { gte: recencyCutoff }, // RATIONALE: Keep recently deleted items visible for UX feedback
            ...(admin.role === "teacher" ? { assignedTeacherId: admin.id } : {})
          }
        ]
      },
      include: {
        assignedTeacher: {
          select: {
            id: true,
            displayName: true
          }
        }
      },
      orderBy: { startAt: "asc" },
      take: MAX_CALENDAR_ROWS
    });

    // Fetch pending and recently rejected/cancelled requests
    const requestRows = await prisma.bookingRequest.findMany({
      where: {
        requestedStartAt: { gte: range.start, lte: range.end },
        ...(admin.role === "teacher" ? { assignedTeacherId: admin.id } : {}),
        OR: [
          { status: "pending" },
          { status: "waitlisted" },
          { status: "rejected", updatedAt: { gte: recencyCutoff } },
          { status: "cancelled", updatedAt: { gte: recencyCutoff } }
        ]
      },
      include: {
        assignedTeacher: {
          select: {
            id: true,
            displayName: true
          }
        }
      },
      orderBy: { requestedStartAt: "asc" },
      take: MAX_CALENDAR_ROWS
    });

    // RATIONALE: The take caps protect the 1G process from an oversized window,
    // but if either cap is actually hit the calendar is silently truncated
    // (asc order drops the latest rows). Warn so it's diagnosable rather than mysterious.
    if (rows.length === MAX_CALENDAR_ROWS || requestRows.length === MAX_CALENDAR_ROWS) {
      log("warn", "admin_bookings.calendar_row_cap_reached", {
        bookings: rows.length,
        requests: requestRows.length,
        cap: MAX_CALENDAR_ROWS
      });
    }

    // Derive which bookings already have an active (non-void/non-deleted) invoice
    // link so the calendar can flag approved-but-unbilled lessons with a badge.
    const bookingIds = rows.map((booking) => booking.id);
    const activeInvoiceLinks =
      bookingIds.length > 0
        ? await prisma.$transaction((tx) => findActiveInvoiceLinksForBookingIds(tx, bookingIds))
        : [];
    const billedBookingIds = new Set(activeInvoiceLinks.map((link) => link.bookingId));

    // Unified Event Mapping
    const events = [
      ...rows.map((booking) => ({
        entityType: "booking" as const,
        id: booking.id,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        status: booking.status,
        attendanceStatus: booking.attendanceStatus,
        color: bookingColor(booking.status),
        title: booking.lastName ? `${booking.lastName}, ${booking.firstName}` : booking.name,
        row: {
          ...booking,
          assignedTeacherName: booking.assignedTeacher?.displayName ?? null,
          hasActiveInvoice: billedBookingIds.has(booking.id)
        }
      })),
      ...requestRows.map((requestRow) => ({
        entityType: "booking_request" as const,
        id: requestRow.id,
        startAt: requestRow.requestedStartAt.toISOString(),
        endAt: requestRow.requestedStartAt.toISOString(),
        status: requestRow.status,
        color: bookingRequestColor(requestRow.status),
        title: requestRow.lastName ? `${requestRow.lastName}, ${requestRow.firstName}` : requestRow.name,
        row: {
          ...requestRow,
          assignedTeacherName: requestRow.assignedTeacher?.displayName ?? null
        }
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
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load admin booking data.");
  }
}

/**
 * POST: Handles the creation of a manual booking by an administrator.
 * 
 * LOGIC:
 * 1. Validates the submission against manualBookingSchema.
 * 2. Resolves the Customer:
 *    - If customerId provided: Check existence and optionally update profile.
 *    - If NO customerId: Search for existing customer by email/phone.
 *    - If match found WITHOUT explicit resolution: Return 409 Conflict.
 *    - Proceed with resolution strategy (create_new | use_existing | update_existing).
 * 3. Ensures Portals Credentials: Every booking ensures the customer has portal access.
 * 4. Financial/Series Logic:
 *    - If Recurring: Generate a series and multiple weekly booking rows in a transaction.
 *    - Else: Create a single booking row.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = manualBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid booking payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const durationMinutes = getDurationMinutes(parsed.data.lessonDuration, parsed.data.customDurationMinutes);
    const lessonPricingMap = await getActiveLessonPricingMap();
    if (lessonPricingMap.size > 0 && !lessonPricingMap.has(durationMinutes)) {
      return NextResponse.json(
        { error: `No active lesson pricing is configured for ${durationMinutes} minute lessons.` },
        { status: 400 }
      );
    }

    const requestedAssignedTeacherId = await resolveAssignedTeacherId({
      db: prisma,
      actor: admin,
      requestedAssignedTeacherId: parsed.data.assignedTeacherId ?? null
    });

    // --- STEP 1: CUSTOMER RESOLUTION ---
    let resolvedExistingCustomerId: string | null = null;
    let shouldCreateCustomer = false;
    let shouldUpdateResolvedCustomer = false;
    if (parsed.data.customerId) {
      // Direct binding to an existing customer record
      const selected = await prisma.customer.findUnique({
        where: { id: parsed.data.customerId }
      });
      if (!selected || selected.isArchived) {
        return NextResponse.json({ error: "Selected customer does not exist." }, { status: 400 });
      }
      if (admin.role === "teacher" && !canManagePrimaryTeacherCustomer(admin, selected.primaryTeacherId)) {
        return NextResponse.json({ error: "Teachers can only book students assigned to themselves." }, { status: 403 });
      }
      resolvedExistingCustomerId = selected.id;
      shouldUpdateResolvedCustomer = Boolean(parsed.data.updateCustomerFromBooking);
    } else {
      // Probabilistic match based on contact details
      const existing = await prisma.customer.findFirst({
        where: {
          isArchived: false,
          OR: [
            { normalizedEmail: normalizeEmail(parsed.data.email) },
            { normalizedPhone: normalizePhone(parsed.data.phone) }
          ]
        },
        orderBy: { createdAt: "desc" }
      });

      if (existing && admin.role === "teacher" && !canManagePrimaryTeacherCustomer(admin, existing.primaryTeacherId)) {
        return NextResponse.json({ error: "Teachers can only book students assigned to themselves." }, { status: 403 });
      }

      // CONFLICT HANDLING: Notify admin of probable duplicate before proceeding
      if (existing && !parsed.data.matchResolution) {
        return NextResponse.json(
          {
            error: "Possible existing customer match found.",
            code: "CUSTOMER_MATCH",
            customer: existing
          },
          { status: 409 }
        );
      }

      // Resolution Application
      if (existing) {
        if (parsed.data.matchResolution === "create_new") {
          shouldCreateCustomer = true;
        } else {
          resolvedExistingCustomerId = existing.id;
          shouldUpdateResolvedCustomer =
            parsed.data.matchResolution === "update_existing" || Boolean(parsed.data.updateCustomerFromBooking);
        }
      } else {
        shouldCreateCustomer = true;
      }
    }

    const startAt = new Date(parsed.data.requestedStartAt);

    await prisma.$transaction(async (tx) => {
      let customerId = resolvedExistingCustomerId;

      if (customerId) {
        const selected = await tx.customer.findUnique({
          where: { id: customerId }
        });
        if (!selected || selected.isArchived) {
          throw new Error("Selected customer does not exist.");
        }
        if (admin.role === "teacher" && !canManagePrimaryTeacherCustomer(admin, selected.primaryTeacherId)) {
          throw new Error("Teachers can only book students assigned to themselves.");
        }
        if (shouldUpdateResolvedCustomer) {
          await updateCustomerFromBooking(tx, selected.id, parsed.data);
        }
      } else if (shouldCreateCustomer) {
        const created = await createCustomerFromBooking(tx, parsed.data, requestedAssignedTeacherId);
        customerId = created.id;
      }

      if (!customerId) {
        throw new Error("Unable to resolve customer for manual booking.");
      }

      // RATIONALE: We ensure every customer booked into the system has portal
      // access so they can receive automated materials and schedule updates.
      await ensurePortalCredentialForCustomer({
        customerId,
        actorId: admin.id,
        tx,
        details: "Portal credential ensured during manual booking create."
      });
      await ensureCustomerPrimaryTeacher({
        db: tx,
        customerId,
        assignedTeacherId: requestedAssignedTeacherId
      });

      // --- STEP 3: PERSISTENCE (Single or Recurring) ---
      if (parsed.data.isRecurring && parsed.data.recurrenceEndAt) {
        const endAt = new Date(parsed.data.recurrenceEndAt);
        let starts: Date[] = [];
        try {
          starts = generateRecurringStartDates({ startAt, recurrenceEndAt: endAt });
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : "Invalid recurrence range.");
        }

        const series = await tx.bookingSeries.create({
          data: {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
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
            startTimeLocal: toTimeKey(startAt),
            startDate: startAt,
            recurrenceEndAt: endAt,
            timezone: APP_TIMEZONE,
            assignedTeacherId: requestedAssignedTeacherId,
            customerId
          }
        });

        await tx.booking.createMany({
          data: starts.map((start) => ({
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
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
            timezone: APP_TIMEZONE,
            notes: parsed.data.notesContent ? tiptapJsonToPlainText(parsed.data.notesContent) || parsed.data.notes : parsed.data.notes,
            notesContent: parsed.data.notesContent ? (parsed.data.notesContent as Prisma.InputJsonValue) : undefined,
            seriesId: series.id,
            assignedTeacherId: requestedAssignedTeacherId,
            customerId,
            modifiedById: admin.id
          }))
        });
      } else {
        // Single booking creation
        await tx.booking.create({
          data: {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
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
            timezone: APP_TIMEZONE,
            notes: parsed.data.notesContent ? tiptapJsonToPlainText(parsed.data.notesContent) || parsed.data.notes : parsed.data.notes,
            notesContent: parsed.data.notesContent ? (parsed.data.notesContent as Prisma.InputJsonValue) : undefined,
            assignedTeacherId: requestedAssignedTeacherId,
            customerId,
            modifiedById: admin.id
          }
        });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create booking.";
    const status =
      message === "Teachers can only book students assigned to themselves." || message === "Selected staff member does not exist."
        ? 403
        : message === "Selected customer does not exist." || message === "Invalid recurrence range."
          ? 400
          : 500;
    if (status === 500) {
      return jsonUnexpectedError(error, "Unable to create booking.");
    }
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
