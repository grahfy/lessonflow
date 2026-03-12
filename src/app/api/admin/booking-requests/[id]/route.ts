import { APP_TIMEZONE } from "@/lib/time";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { canManageAssignedTeacher, isOwner } from "@/lib/admin/permissions";
import { ensureCustomerPrimaryTeacher, resolveAssignedTeacherId } from "@/lib/admin/teacher-assignment";
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
import { customerSnapshotFromInput, normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { getStudentPortalLoginUrl } from "@/lib/env";
import { ensurePortalCredentialForCustomer } from "@/lib/student-portal/credentials";

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
  assignedTeacherId: z.string().trim().min(1).nullable().optional(),
  requestedStartAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceEndAt: z.string().datetime({ offset: true }).nullable().optional()
});

/** Formats the recurring-series start time in the app's canonical local timezone. */
function localTime(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

/**
 * Resolves the customer associated with a booking request approval.
 * Existing linked customer wins, then deterministic email/phone match, then new customer create.
 */
async function resolveCustomerIdForApproval(input: {
  tx: Prisma.TransactionClient;
  bookingRequest: {
    customerId: string | null;
    name: string;
    email: string;
    phone: string;
    lessonMode: "in_person" | "video";
    skillLevel: "beginner" | "intermediate" | "advanced";
    unitNumber: string | null;
    houseNumber: string;
    streetName: string;
    streetType: string;
    suburb: string;
    state: string;
    postcode: string;
  };
}): Promise<string> {
  if (input.bookingRequest.customerId) {
    // RATIONALE: When an admin or public flow already linked a customer to the
    // request, approval should preserve that relationship rather than re-match
    // by contact details and risk switching to a different family profile.
    const linked = await input.tx.customer.findUnique({
      where: {
        id: input.bookingRequest.customerId
      }
    });
    if (linked && !linked.isArchived) {
      return linked.id;
    }
  }

  // NOTE: Deterministic matching is intentionally limited to normalized email
  // and phone. Name-only matching is too ambiguous for an approval pathway that
  // can create bookings, portal credentials, and customer-facing email.
  const existing = await input.tx.customer.findFirst({
    where: {
      isArchived: false,
      OR: [
        { normalizedEmail: normalizeEmail(input.bookingRequest.email) },
        { normalizedPhone: normalizePhone(input.bookingRequest.phone) }
      ]
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  if (existing) {
    return existing.id;
  }

  // RATIONALE: Approval is allowed to bootstrap a new customer because the
  // request has passed through admin review and now becomes a first-class
  // student record in the system.
  const normalizedState = auStateSchema.safeParse(input.bookingRequest.state);

  const created = await input.tx.customer.create({
    data: customerSnapshotFromInput({
      name: input.bookingRequest.name,
      email: input.bookingRequest.email,
      phone: input.bookingRequest.phone,
      skillLevel: input.bookingRequest.skillLevel,
      lessonMode: input.bookingRequest.lessonMode,
      unitNumber: input.bookingRequest.unitNumber ?? undefined,
      houseNumber: input.bookingRequest.houseNumber,
      streetName: input.bookingRequest.streetName,
      streetType: input.bookingRequest.streetType,
      suburb: input.bookingRequest.suburb,
      state: normalizedState.success ? normalizedState.data : "VIC",
      postcode: input.bookingRequest.postcode
    })
  });
  return created.id;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
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
      if (!isOwner(admin)) {
        return NextResponse.json({ error: "Only the owner can approve booking requests." }, { status: 403 });
      }
      if (bookingRequest.status !== "pending") {
        return NextResponse.json({ error: "Only pending requests can be approved." }, { status: 400 });
      }

      const requestedAssignedTeacherId = await resolveAssignedTeacherId({
        db: prisma,
        actor: admin,
        requestedAssignedTeacherId:
          body && Object.prototype.hasOwnProperty.call(body, "assignedTeacherId")
            ? (body.assignedTeacherId as string | null)
            : bookingRequest.assignedTeacherId,
        fallbackTeacherId:
          body && Object.prototype.hasOwnProperty.call(body, "assignedTeacherId") && body.assignedTeacherId === null
            ? null
            : bookingRequest.assignedTeacherId
      });

      // Approval spans customer resolution, booking creation, request status update, and portal
      // credential ensure. Keeping this transactional prevents partially approved states.
      const approvalResult = await prisma.$transaction(async (tx) => {
        const customerId = await resolveCustomerIdForApproval({
          tx,
          bookingRequest
        });
        if (!customerId) {
          throw new Error("Unable to resolve customer before approval.");
        }

        if (bookingRequest.isRecurring && bookingRequest.recurrenceEndAt) {
          // Recurring approvals create a series plus one booking row per generated start date.
          const series = await tx.bookingSeries.create({
            data: {
              firstName: bookingRequest.firstName,
              lastName: bookingRequest.lastName,
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
              timezone: APP_TIMEZONE,
              assignedTeacherId: requestedAssignedTeacherId,
              customerId
            }
          });

          const starts = generateRecurringStartDates({
            startAt: bookingRequest.requestedStartAt,
            recurrenceEndAt: bookingRequest.recurrenceEndAt
          });

          // NOTE: The request remains the provenance link for every generated
          // booking row so later admin investigation can trace the series back
          // to the original request details and approval action.
          await tx.booking.createMany({
            data: starts.map((startAt) => ({
              firstName: bookingRequest.firstName,
              lastName: bookingRequest.lastName,
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
              timezone: APP_TIMEZONE,
              requestId: bookingRequest.id,
              seriesId: series.id,
              assignedTeacherId: requestedAssignedTeacherId,
              customerId,
              modifiedById: admin.id
            }))
          });
        } else {
          await tx.booking.create({
            data: {
              firstName: bookingRequest.firstName,
              lastName: bookingRequest.lastName,
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
              timezone: APP_TIMEZONE,
              requestId: bookingRequest.id,
              assignedTeacherId: requestedAssignedTeacherId,
              customerId,
              modifiedById: admin.id
            }
          });
        }

        const updated = await tx.bookingRequest.update({
          where: { id },
          data: {
            status: "approved",
            approvedById: admin.id,
            assignedTeacherId: requestedAssignedTeacherId,
            customerId
          }
        });

        await ensureCustomerPrimaryTeacher({
          db: tx,
          customerId,
          assignedTeacherId: requestedAssignedTeacherId
        });

        // Ensure portal credentials before the approval email so first-time approved students can
        // log in immediately from the email payload.
        const credentialResult = await ensurePortalCredentialForCustomer({
          customerId,
          actorId: admin.id,
          tx,
          details: `Portal credential ensured during booking request approval (${id}).`
        });

        return {
          updated,
          generatedPassword: credentialResult.generatedPassword
        };
      });

      // Send customer email after transaction commit to avoid sending approvals that failed to persist.
      // Audit log entry is recorded by the event wrapper.
      // RATIONALE: The credential helper returns a plaintext password only when a
      // credential is created/rotated during this approval. Existing customers
      // keep their current portal access and therefore receive no new password.
      await sendCustomerBookingStatusEmail({
        email: approvalResult.updated.email,
        name: approvalResult.updated.name,
        status: approvalResult.updated.status,
        when: approvalResult.updated.requestedStartAt,
        portalAccess: approvalResult.generatedPassword
          ? {
              loginUrl: getStudentPortalLoginUrl(),
              generatedPassword: approvalResult.generatedPassword
            }
          : null,
        audit: {
          // Approvals create bookings; link audit to the first/primary booking created.
          // For recurring approvals, several are created but one audit log entry covers the event.
          // Traceability back to the request ID is preserved via details.
          actorId: admin.id,
          action: "approved",
          details: `requestId=${id}`
        }
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "reject") {
      if (!canManageAssignedTeacher(admin, bookingRequest.assignedTeacherId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (bookingRequest.status !== "pending") {
        return NextResponse.json({ error: "Only pending requests can be rejected." }, { status: 400 });
      }

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
        // NOTE: The shared booking-status email templates use the cancelled copy
        // path for both admin rejection and student-side cancellation outcomes.
        status: "cancelled",
        when: updated.requestedStartAt,
        audit: {
          actorId: admin.id,
          action: "rejected",
          details: `requestId=${id}`
        }
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "cancel") {
      if (!canManageAssignedTeacher(admin, bookingRequest.assignedTeacherId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (bookingRequest.status !== "pending") {
        return NextResponse.json({ error: "Only pending requests can be cancelled." }, { status: 400 });
      }

      const updated = await prisma.bookingRequest.update({
        where: { id },
        data: {
          status: "cancelled",
          approvedById: admin.id
        }
      });

      await sendCustomerBookingStatusEmail({
        email: updated.email,
        name: updated.name,
        // RATIONALE: Admin-driven cancellation uses the same outward-facing
        // customer messaging as rejection because the lesson will not proceed.
        status: "cancelled",
        when: updated.requestedStartAt,
        audit: {
          actorId: admin.id,
          action: "cancelled",
          details: `requestId=${id}`
        }
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "move") {
      if (!canManageAssignedTeacher(admin, bookingRequest.assignedTeacherId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (bookingRequest.status !== "pending") {
        return NextResponse.json({ error: "Only pending requests can be moved." }, { status: 400 });
      }

      // NOTE: Move is intentionally narrow: it only reschedules the request
      // timestamp and leaves the rest of the intake data untouched.
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
      if (!canManageAssignedTeacher(admin, bookingRequest.assignedTeacherId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (bookingRequest.status !== "pending") {
        return NextResponse.json({ error: "Only pending requests can be edited." }, { status: 400 });
      }

      const nextAssignedTeacherId =
        parsed.data.assignedTeacherId === undefined
          ? bookingRequest.assignedTeacherId
          : await resolveAssignedTeacherId({
              db: prisma,
              actor: admin,
              requestedAssignedTeacherId: parsed.data.assignedTeacherId,
              fallbackTeacherId: parsed.data.assignedTeacherId === null ? null : bookingRequest.assignedTeacherId
            });

      // As with booking edits, compute the full next-state payload server-side for consistency and
      // to preserve required fields during partial updates.
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
      // RATIONALE: Partial edits still need a fully valid request record. We
      // therefore validate the merged next-state instead of only the provided
      // patch fields, which prevents accidentally blanking required data.
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
          ...(isOwner(admin) ? { assignedTeacherId: nextAssignedTeacherId } : {}),
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
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update booking request.");
  }
}

/**
 * DELETE /api/admin/booking-requests/[id]
 * Permanently deletes a booking request row so it no longer appears in the
 * admin calendar/history recency window.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.bookingRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        assignedTeacherId: true
      }
    });
    if (!existing) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    if (!canManageAssignedTeacher(admin, existing.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // RATIONALE: Once approved, the request is no longer the operational source
    // of truth. The booking rows created from it must be managed through the
    // booking APIs so audit/workflow semantics stay consistent.
    if (existing.status === "approved") {
      return NextResponse.json(
        {
          error: "Approved requests cannot be deleted from this screen. Delete the booking record instead."
        },
        { status: 400 }
      );
    }

    await prisma.bookingRequest.delete({
      where: { id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete booking request.");
  }
}
