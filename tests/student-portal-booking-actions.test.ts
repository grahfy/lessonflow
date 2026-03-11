import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { PATCH as cancelStudentBooking } from "@/app/api/student/bookings/[id]/route";
import { POST as createStudentBooking } from "@/app/api/student/bookings/route";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import {
  studentPortalBookingRequestResponseSchema,
  studentPortalCancelBookingResponseSchema
} from "@/lib/student-portal/contracts";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

describe("student-portal-booking-actions", () => {
  beforeEach(async () => {
    // RATIONALE: Student booking actions can create emails/audit rows as well
    // as request/booking records, so cleanup needs to reset the full graph.
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.outboundEmail.deleteMany();
  });

  it("creates pending booking requests linked to the student customer", async () => {
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        firstName: "Action",
        lastName: "Student",
        name: "Action Student",
        email: "action.student@example.com",
        phone: "0400555000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "12",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });

    const request = new NextRequest("http://localhost/api/student/bookings", {
      method: "POST",
      body: JSON.stringify({
        requestedStartAt: addDays(new Date(), 2).toISOString(),
        lessonMode: "video",
        lessonDuration: "min30",
        notes: "Can we focus on chord transitions?"
      }),
      headers: {
        "content-type": "application/json",
        cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`
      }
    });
    const response = await createStudentBooking(request);
    expect(response.status).toBe(201);
    const createPayload = studentPortalBookingRequestResponseSchema.parse(await response.json());
    // NOTE: The response schema is part of the contract for optimistic portal
    // UI updates, not just a convenience wrapper around the DB row.
    expect(createPayload.request.status).toBe("pending");

    const created = await prisma.bookingRequest.findFirstOrThrow({
      where: {
        customerId: customer.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(created.status).toBe("pending");
    expect(created.firstName).toBe("Action");
    expect(created.lastName).toBe("Student");
    expect(created.lessonMode).toBe("video");
    expect(created.lessonDuration).toBe("min30");
  });

  it("cancels an upcoming owned booking", async () => {
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Cancel Student",
        email: "cancel.student@example.com",
        phone: "0400666000",
        lessonMode: "in_person",
        skillLevel: "intermediate",
        unitNumber: undefined,
        houseNumber: "10",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });
    const booking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Smith Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        startAt: addDays(new Date(), 3),
        endAt: addDays(new Date(), 3),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });

    const request = new NextRequest(`http://localhost/api/student/bookings/${booking.id}`, {
      method: "PATCH",
      headers: {
        cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`
      }
    });
    const response = await cancelStudentBooking(request, {
      params: Promise.resolve({ id: booking.id })
    });
    expect(response.status).toBe(200);
    const cancelPayload = studentPortalCancelBookingResponseSchema.parse(await response.json());
    expect(cancelPayload.booking.status).toBe("cancelled");

    const cancelled = await prisma.booking.findUniqueOrThrow({
      where: {
        id: booking.id
      }
    });
    expect(cancelled.status).toBe("cancelled");
    const log = await prisma.bookingAuditLog.findFirst({
      where: {
        bookingId: booking.id,
        action: "cancelled"
      }
    });
    // RATIONALE: Portal cancellations must leave an audit trail because they
    // affect attendance, reminder flows, and possible billing follow-up.
    expect(log).not.toBeNull();
  });
});
