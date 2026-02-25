import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { bookingColor, bookingRequestColor, getRecencyCutoff } from "@/lib/admin-calendar-events";
import { bookingRequestSchema, formatBookingAddress, generateRecurringStartDates, getBookingEnd } from "@/lib/booking-rules";
import { customerSnapshotFromInput, normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { getCalendarRange } from "@/lib/calendar-range";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { ensurePortalCredentialForCustomer } from "@/lib/student-portal/credentials";

const manualBookingSchema = bookingRequestSchema.and(
  z.object({
    customerId: z.string().trim().min(1).optional(),
    matchResolution: z.enum(["use_existing", "create_new", "update_existing"]).optional(),
    updateCustomerFromBooking: z.boolean().optional()
  })
);

type ManualBookingInput = z.infer<typeof manualBookingSchema>;

/**
 * Creates a customer from a validated manual-booking payload.
 *
 * Extracted helper keeps the route's match-resolution logic readable.
 */
async function createCustomerFromBooking(input: ManualBookingInput) {
  return prisma.customer.create({
    data: customerSnapshotFromInput({
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
 * Updates an existing customer from booking input when the admin explicitly chooses to sync data.
 */
async function updateCustomerFromBooking(id: string, input: ManualBookingInput) {
  return prisma.customer.update({
    where: { id },
    data: customerSnapshotFromInput({
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

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const viewRaw = request.nextUrl.searchParams.get("view") || "week";
    const date = request.nextUrl.searchParams.get("date") || undefined;
    const view = viewRaw === "day" || viewRaw === "month" ? viewRaw : "week";
    const range = getCalendarRange(view, date);
    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
      return NextResponse.json({ error: "Invalid calendar date." }, { status: 400 });
    }
    const now = new Date();
    const recencyCutoff = getRecencyCutoff(now);
    // Include recently cancelled/rejected items briefly so admins can confirm actions after reload
    // without permanently cluttering the calendar.

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
          },
          {
            status: "cancelled",
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load admin booking data." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = manualBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  // Manual booking creation can bind to a selected customer, resolve a probable existing match,
  // or create a new customer depending on the submitted match-resolution fields.
  let customerId: string | null = null;
  if (parsed.data.customerId) {
    const selected = await prisma.customer.findUnique({
      where: {
        id: parsed.data.customerId
      }
    });
    if (!selected || selected.isArchived) {
      return NextResponse.json({ error: "Selected customer does not exist." }, { status: 400 });
    }
    customerId = selected.id;
    if (parsed.data.updateCustomerFromBooking) {
      await updateCustomerFromBooking(selected.id, parsed.data);
    }
  } else {
    const existing = await prisma.customer.findFirst({
      where: {
        isArchived: false,
        OR: [
          { normalizedEmail: normalizeEmail(parsed.data.email) },
          { normalizedPhone: normalizePhone(parsed.data.phone) }
        ]
      },
      orderBy: {
        createdAt: "desc"
      }
    });

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

    if (existing) {
      if (parsed.data.matchResolution === "create_new") {
        const created = await createCustomerFromBooking(parsed.data);
        customerId = created.id;
      } else {
        customerId = existing.id;
        if (parsed.data.matchResolution === "update_existing" || parsed.data.updateCustomerFromBooking) {
          await updateCustomerFromBooking(existing.id, parsed.data);
        }
      }
    } else {
      const created = await createCustomerFromBooking(parsed.data);
      customerId = created.id;
    }
  }

  if (!customerId) {
    return NextResponse.json({ error: "Unable to resolve customer for manual booking." }, { status: 500 });
  }

  await ensurePortalCredentialForCustomer({
    customerId,
    actorId: admin.id,
    details: "Portal credential ensured during manual booking create."
  });

  const startAt = new Date(parsed.data.requestedStartAt);
  if (parsed.data.isRecurring && parsed.data.recurrenceEndAt) {
    const endAt = new Date(parsed.data.recurrenceEndAt);
    const starts = generateRecurringStartDates({ startAt, recurrenceEndAt: endAt });

    // Persist a series record for recurrence metadata, then create the operational booking rows.
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
        timezone: "Australia/Melbourne",
        customerId
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
            customerId,
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
        customerId,
        modifiedById: admin.id
      }
    });
  }

  return NextResponse.json({ ok: true });
}
