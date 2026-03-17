/**
 * Admin Bookings API Route
 * 
 * Handles reading calendar events and creating manual bookings for administrators.
 * This route is the backbone of the Admin Calendar UI.
 */

import { APP_TIMEZONE, toTimeKey } from "@/lib/time";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { bookingColor, bookingRequestColor, getRecencyCutoff } from "@/lib/admin-calendar-events";
import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { ensureCustomerPrimaryTeacher, resolveAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import { adminManualBookingSchema, formatBookingAddress, generateRecurringStartDates, getBookingEnd } from "@/lib/booking-rules";
import { customerSnapshotFromInput, normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { getCalendarRange } from "@/lib/calendar-range";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { ensurePortalCredentialForCustomer } from "@/lib/student-portal/credentials";

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
 * Internal helper to create a new customer record from booking data.
 */
async function createCustomerFromBooking(input: ManualBookingInput, primaryTeacherId?: string | null) {
  return prisma.customer.create({
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
async function updateCustomerFromBooking(id: string, input: ManualBookingInput) {
  return prisma.customer.update({
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
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const viewRaw = request.nextUrl.searchParams.get("view") || "week";
    const date = request.nextUrl.searchParams.get("date") || undefined;
    const view = viewRaw === "day" || viewRaw === "month" || viewRaw === "year" ? viewRaw : "week";
    const range = getCalendarRange(view, date);
    
    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
      return NextResponse.json({ error: "Invalid calendar date." }, { status: 400 });
    }
    
    const now = new Date();
    const recencyCutoff = getRecencyCutoff(now);

    // Fetch approved and recently cancelled bookings
    const rows = await prisma.booking.findMany({
      where: {
        OR: [
          {
            status: "approved",
            startAt: { gte: range.start, lte: range.end }
          },
          {
            status: "cancelled",
            startAt: { gte: range.start, lte: range.end },
            updatedAt: { gte: recencyCutoff } // RATIONALE: Keep recently deleted items visible for UX feedback
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
      orderBy: { startAt: "asc" }
    });

    // Fetch pending and recently rejected/cancelled requests
    const requestRows = await prisma.bookingRequest.findMany({
      where: {
        requestedStartAt: { gte: range.start, lte: range.end },
        OR: [
          { status: "pending" },
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
      orderBy: { requestedStartAt: "asc" }
    });

    // Unified Event Mapping
    const events = [
      ...rows.map((booking) => ({
        entityType: "booking" as const,
        id: booking.id,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        status: booking.status,
        color: bookingColor(booking.status),
        title: booking.lastName ? `${booking.lastName}, ${booking.firstName}` : booking.name,
        row: {
          ...booking,
          assignedTeacherName: booking.assignedTeacher?.displayName ?? null
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load admin booking data." },
      { status: 500 }
    );
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
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = manualBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid booking payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const requestedAssignedTeacherId = await resolveAssignedTeacherId({
      db: prisma,
      actor: admin,
      requestedAssignedTeacherId: parsed.data.assignedTeacherId ?? null
    });

    // --- STEP 1: CUSTOMER RESOLUTION ---
    let customerId: string | null = null;
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
      customerId = selected.id;
      if (parsed.data.updateCustomerFromBooking) {
        await updateCustomerFromBooking(selected.id, parsed.data);
      }
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
          const created = await createCustomerFromBooking(parsed.data, requestedAssignedTeacherId);
          customerId = created.id;
        } else {
          customerId = existing.id;
          if (parsed.data.matchResolution === "update_existing" || parsed.data.updateCustomerFromBooking) {
            await updateCustomerFromBooking(existing.id, parsed.data);
          }
        }
      } else {
        const created = await createCustomerFromBooking(parsed.data, requestedAssignedTeacherId);
        customerId = created.id;
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: "Unable to resolve customer for manual booking." }, { status: 500 });
    }

    // --- STEP 2: ACCESS CONTROL ---
    // RATIONALE: We ensure every customer booked into the system has portal
    // access so they can receive automated materials and schedule updates.
    await ensurePortalCredentialForCustomer({
      customerId,
      actorId: admin.id,
      details: "Portal credential ensured during manual booking create."
    });
    await ensureCustomerPrimaryTeacher({
      db: prisma,
      customerId,
      assignedTeacherId: requestedAssignedTeacherId
    });

    const startAt = new Date(parsed.data.requestedStartAt);

    // --- STEP 3: PERSISTENCE (Single or Recurring) ---
    if (parsed.data.isRecurring && parsed.data.recurrenceEndAt) {
      const endAt = new Date(parsed.data.recurrenceEndAt);
      let starts: Date[] = [];
      try {
        starts = generateRecurringStartDates({ startAt, recurrenceEndAt: endAt });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid recurrence range." },
          { status: 400 }
        );
      }

      // 3a. Create the high-level Series record
      const series = await prisma.bookingSeries.create({
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

      // 3b. Create individual booking instances in a transaction to ensure all or nothing
      await prisma.$transaction(
        starts.map((start) =>
          prisma.booking.create({
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
              startAt: start,
              endAt: getBookingEnd(start, parsed.data.lessonDuration, parsed.data.customDurationMinutes),
              timezone: APP_TIMEZONE,
              notes: parsed.data.notes,
              seriesId: series.id,
              assignedTeacherId: requestedAssignedTeacherId,
              customerId,
              modifiedById: admin.id
            }
          })
        )
      );
    } else {
      // Single booking creation
      await prisma.booking.create({
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
          notes: parsed.data.notes,
          assignedTeacherId: requestedAssignedTeacherId,
          customerId,
          modifiedById: admin.id
        }
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create booking." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
