import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as bookingNotify } from "@/app/api/admin/bookings/[id]/notify/route";
import { GET as listBookingRequests } from "@/app/api/admin/booking-requests/route";
import { DELETE as removeBookingSeries } from "@/app/api/admin/booking-series/[id]/route";
import { POST as createBooking } from "@/app/api/admin/bookings/route";
import { GET as listBookings } from "@/app/api/admin/bookings/route";
import { PATCH as updateBooking } from "@/app/api/admin/bookings/[id]/route";
import { POST as saveContent } from "@/app/api/admin/content/route";
import { GET as getCustomer, PATCH as updateCustomer } from "@/app/api/admin/customers/[id]/route";
import { GET as listCustomers } from "@/app/api/admin/customers/route";
import { POST as sendCustomerEmail } from "@/app/api/admin/customers/[id]/email/route";
import { GET as listInvoices } from "@/app/api/admin/invoices/route";
import { POST as createPreset } from "@/app/api/admin/presets/route";
import { GET as getSettings } from "@/app/api/admin/settings/route";
import { PATCH as updateStaff } from "@/app/api/admin/staff/[id]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

function authHeaders(token: string, includeJson = false) {
  return {
    ...(includeJson ? { "content-type": "application/json" } : {}),
    cookie: `${getSessionCookieName()}=${token}`
  };
}

async function createTeacher(email: string, displayName: string) {
  return prisma.adminUser.create({
    data: {
      email,
      role: "teacher",
      firstName: displayName,
      displayName,
      passwordHash: await bcrypt.hash("teacher-password", 12),
      isActive: true
    }
  });
}

function baseBookingPayload(startAt: string) {
  return {
    firstName: "Jamie",
    lastName: "Student",
    name: "Jamie Student",
    email: "jamie@example.com",
    phone: "0400123456",
    unitNumber: "2",
    houseNumber: "66",
    streetName: "High",
    streetType: "Street",
    suburb: "Northcote",
    state: "VIC",
    postcode: "3070",
    lessonMode: "video",
    skillLevel: "intermediate",
    lessonDuration: "min60",
    requestedStartAt: startAt,
    isRecurring: false
  };
}

describe("admin role permissions", () => {
  beforeEach(async () => {
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("blocks teachers from owner-only settings", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-settings@example.com", "Teacher Settings");
    const token = createSessionToken(teacher.email);

    const response = await getSettings(
      new NextRequest("http://localhost/api/admin/settings", {
        headers: authHeaders(token)
      })
    );

    expect(response.status).toBe(403);
  });

  it("blocks teachers from owner-only invoice routes", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-invoices@example.com", "Teacher Invoices");
    const token = createSessionToken(teacher.email);

    const response = await listInvoices(
      new NextRequest("http://localhost/api/admin/invoices", {
        headers: authHeaders(token)
      })
    );

    expect(response.status).toBe(403);
  });

  it("blocks teachers from owner-only content and preset mutations", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-content@example.com", "Teacher Content");
    const token = createSessionToken(teacher.email);

    const contentResponse = await saveContent(
      new NextRequest("http://localhost/api/admin/content", {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          pagePath: "/",
          sectionKey: "hero",
          content: { title: "Teacher edit" }
        })
      })
    );
    expect(contentResponse.status).toBe(403);

    const presetResponse = await createPreset(
      new NextRequest("http://localhost/api/admin/presets", {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          label: "Teacher Preset",
          description: "",
          unitPriceCents: 5000
        })
      })
    );
    expect(presetResponse.status).toBe(403);
  });

  it("auto-assigns teacher-created bookings to the signed-in teacher and sets the customer default teacher", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-booking@example.com", "Teacher Booking");
    const token = createSessionToken(teacher.email);

    const response = await createBooking(
      new NextRequest("http://localhost/api/admin/bookings", {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify(baseBookingPayload(addDays(new Date(), 7).toISOString()))
      })
    );

    expect(response.status).toBe(200);

    const booking = await prisma.booking.findFirstOrThrow({
      where: { email: "jamie@example.com" }
    });
    const customer = await prisma.customer.findFirstOrThrow({
      where: { email: "jamie@example.com" }
    });

    expect(booking.assignedTeacherId).toBe(teacher.id);
    expect(customer.primaryTeacherId).toBe(teacher.id);
  });

  it("auto-assigns owner-created bookings when exactly one active teacher exists", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("solo-owner-booking@example.com", "Solo Owner Booking");
    const owner = await prisma.adminUser.findFirstOrThrow({
      where: { role: "owner" }
    });
    const token = createSessionToken(owner.email);

    const response = await createBooking(
      new NextRequest("http://localhost/api/admin/bookings", {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify(baseBookingPayload(addDays(new Date(), 9).toISOString()))
      })
    );

    expect(response.status).toBe(200);

    const booking = await prisma.booking.findFirstOrThrow({
      where: { email: "jamie@example.com" },
      orderBy: { createdAt: "desc" }
    });
    const customer = await prisma.customer.findFirstOrThrow({
      where: { email: "jamie@example.com" },
      orderBy: { createdAt: "desc" }
    });

    expect(booking.assignedTeacherId).toBe(teacher.id);
    expect(customer.primaryTeacherId).toBe(teacher.id);
  });

  it("auto-assigns owner-created bookings to the owner when no teachers exist", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const response = await createBooking(
      new NextRequest("http://localhost/api/admin/bookings", {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify(baseBookingPayload(addDays(new Date(), 11).toISOString()))
      })
    );

    expect(response.status).toBe(200);

    const booking = await prisma.booking.findFirstOrThrow({
      where: { email: "jamie@example.com" },
      orderBy: { createdAt: "desc" }
    });
    const customer = await prisma.customer.findFirstOrThrow({
      where: { email: "jamie@example.com" },
      orderBy: { createdAt: "desc" }
    });

    expect(booking.assignedTeacherId).toBe(owner.id);
    expect(customer.primaryTeacherId).toBe(owner.id);
  });

  it("prevents teachers from editing another teacher's booking", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("teacher-a@example.com", "Teacher A");
    const teacherB = await createTeacher("teacher-b@example.com", "Teacher B");
    const token = createSessionToken(teacherB.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Protected Booking",
        email: "protected@example.com",
        phone: "0400000000",
        address: "12 Smith Street, Northcote VIC 3070",
        houseNumber: "12",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: addDays(new Date(), 8),
        endAt: addDays(new Date(), 8),
        timezone: "Australia/Melbourne",
        assignedTeacherId: teacherA.id
      }
    });

    const response = await updateBooking(
      new NextRequest(`http://localhost/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          action: "edit",
          notes: "Teacher B should not be able to save this."
        })
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );

    expect(response.status).toBe(403);
  });

  it("prevents teachers from cancelling another teacher's booking series", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("series-owner@example.com", "Series Owner");
    const teacherB = await createTeacher("series-other@example.com", "Series Other");
    const token = createSessionToken(teacherB.email);

    const series = await prisma.bookingSeries.create({
      data: {
        name: "Protected Series",
        email: "series@example.com",
        phone: "0400001000",
        address: "20 Smith Street, Northcote VIC 3070",
        houseNumber: "20",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        dayOfWeek: 2,
        startTimeLocal: "09:00",
        startDate: addDays(new Date(), 7),
        recurrenceEndAt: addDays(new Date(), 35),
        timezone: "Australia/Melbourne",
        assignedTeacherId: teacherA.id
      }
    });

    const response = await removeBookingSeries(
      new NextRequest(`http://localhost/api/admin/booking-series/${series.id}`, {
        method: "DELETE",
        headers: authHeaders(token)
      }),
      { params: Promise.resolve({ id: series.id }) }
    );

    expect(response.status).toBe(403);
  });

  it("cancels only future bookings when removing a booking series", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const now = new Date();

    const series = await prisma.bookingSeries.create({
      data: {
        name: "Managed Series",
        email: "managed-series@example.com",
        phone: "0400002000",
        address: "20 Smith Street, Northcote VIC 3070",
        houseNumber: "20",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        dayOfWeek: 2,
        startTimeLocal: "09:00",
        startDate: addDays(now, 7),
        recurrenceEndAt: addDays(now, 35),
        timezone: "Australia/Melbourne",
        assignedTeacherId: owner.id
      }
    });

    const pastBooking = await prisma.booking.create({
      data: {
        name: "Past Series Lesson",
        email: "managed-series@example.com",
        phone: "0400002000",
        address: "20 Smith Street, Northcote VIC 3070",
        houseNumber: "20",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: addDays(now, -7),
        endAt: addDays(now, -7),
        timezone: "Australia/Melbourne",
        seriesId: series.id,
        assignedTeacherId: owner.id
      }
    });

    const futureBooking = await prisma.booking.create({
      data: {
        name: "Future Series Lesson",
        email: "managed-series@example.com",
        phone: "0400002000",
        address: "20 Smith Street, Northcote VIC 3070",
        houseNumber: "20",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: addDays(now, 7),
        endAt: addDays(now, 7),
        timezone: "Australia/Melbourne",
        seriesId: series.id,
        assignedTeacherId: owner.id
      }
    });

    const response = await removeBookingSeries(
      new NextRequest(`http://localhost/api/admin/booking-series/${series.id}`, {
        method: "DELETE",
        headers: authHeaders(token)
      }),
      { params: Promise.resolve({ id: series.id }) }
    );

    expect(response.status).toBe(200);

    const updatedSeries = await prisma.bookingSeries.findUniqueOrThrow({
      where: { id: series.id }
    });
    expect(updatedSeries.isActive).toBe(false);

    const persistedPastBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: pastBooking.id }
    });
    expect(persistedPastBooking.status).not.toBe("cancelled");

    const persistedFutureBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: futureBooking.id }
    });
    expect(persistedFutureBooking.status).toBe("cancelled");

    const auditRow = await prisma.bookingAuditLog.findFirst({
      where: {
        actorId: owner.id,
        action: "series_removed"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(auditRow?.details).toContain(series.id);
  });

  it("allows teachers to update assigned students but not other customers", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-customer@example.com", "Teacher Customer");
    const otherTeacher = await createTeacher("teacher-other@example.com", "Teacher Other");
    const token = createSessionToken(teacher.email);

    const assignedCustomer = await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name: "Assigned Student",
          email: "assigned@example.com",
          phone: "0400999000",
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "14",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070"
        }),
        primaryTeacherId: teacher.id
      }
    });

    const otherCustomer = await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name: "Other Student",
          email: "other@example.com",
          phone: "0400888000",
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "15",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070"
        }),
        primaryTeacherId: otherTeacher.id
      }
    });

    const allowed = await updateCustomer(
      new NextRequest(`http://localhost/api/admin/customers/${assignedCustomer.id}`, {
        method: "PATCH",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          phone: "0400111222"
        })
      }),
      { params: Promise.resolve({ id: assignedCustomer.id }) }
    );
    expect(allowed.status).toBe(200);

    const forbidden = await updateCustomer(
      new NextRequest(`http://localhost/api/admin/customers/${otherCustomer.id}`, {
        method: "PATCH",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          phone: "0400333444"
        })
      }),
      { params: Promise.resolve({ id: otherCustomer.id }) }
    );
    expect(forbidden.status).toBe(403);
  });

  it("scopes teacher customer reads to assigned students only", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-read-customer@example.com", "Teacher Read Customer");
    const otherTeacher = await createTeacher("teacher-read-other@example.com", "Teacher Read Other");
    const token = createSessionToken(teacher.email);

    const assignedCustomer = await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name: "Assigned Reader",
          email: "assigned-reader@example.com",
          phone: "0400123000",
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "1",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070"
        }),
        primaryTeacherId: teacher.id
      }
    });

    const otherCustomer = await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name: "Other Reader",
          email: "other-reader@example.com",
          phone: "0400456000",
          lessonMode: "video",
          skillLevel: "intermediate",
          unitNumber: undefined,
          houseNumber: "2",
          streetName: "High",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070"
        }),
        primaryTeacherId: otherTeacher.id
      }
    });

    const listResponse = await listCustomers(
      new NextRequest("http://localhost/api/admin/customers", {
        headers: authHeaders(token)
      })
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { customers: Array<{ id: string }> };
    expect(listBody.customers.map((customer) => customer.id)).toEqual([assignedCustomer.id]);

    const allowedDetail = await getCustomer(
      new NextRequest(`http://localhost/api/admin/customers/${assignedCustomer.id}`, {
        headers: authHeaders(token)
      }),
      { params: Promise.resolve({ id: assignedCustomer.id }) }
    );
    expect(allowedDetail.status).toBe(200);

    const forbiddenDetail = await getCustomer(
      new NextRequest(`http://localhost/api/admin/customers/${otherCustomer.id}`, {
        headers: authHeaders(token)
      }),
      { params: Promise.resolve({ id: otherCustomer.id }) }
    );
    expect(forbiddenDetail.status).toBe(403);
  });

  it("scopes teacher booking and booking-request reads to assigned rows only", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-read-booking@example.com", "Teacher Read Booking");
    const otherTeacher = await createTeacher("teacher-read-booking-other@example.com", "Teacher Read Booking Other");
    const token = createSessionToken(teacher.email);
    const teacherBookingStartAt = new Date("2026-04-14T09:00:00.000Z");
    const otherBookingStartAt = new Date("2026-04-15T09:00:00.000Z");
    const teacherRequestedStartAt = new Date("2026-04-16T09:00:00.000Z");
    const otherRequestedStartAt = new Date("2026-04-17T09:00:00.000Z");

    await prisma.booking.createMany({
      data: [
        {
          name: "Teacher Booking",
          email: "teacher-booking@example.com",
          phone: "0400000001",
          address: "1 Main Street, Northcote VIC 3070",
          houseNumber: "1",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
          lessonMode: "in_person",
          skillLevel: "beginner",
          lessonDuration: "min60",
          startAt: teacherBookingStartAt,
          endAt: addDays(teacherBookingStartAt, 0),
          timezone: "Australia/Melbourne",
          assignedTeacherId: teacher.id
        },
        {
          name: "Other Booking",
          email: "other-booking@example.com",
          phone: "0400000002",
          address: "2 Main Street, Northcote VIC 3070",
          houseNumber: "2",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
          lessonMode: "video",
          skillLevel: "intermediate",
          lessonDuration: "min30",
          startAt: otherBookingStartAt,
          endAt: addDays(otherBookingStartAt, 0),
          timezone: "Australia/Melbourne",
          assignedTeacherId: otherTeacher.id
        }
      ]
    });

    await prisma.bookingRequest.createMany({
      data: [
        {
          name: "Teacher Request",
          email: "teacher-request@example.com",
          phone: "0400000003",
          address: "3 Main Street, Northcote VIC 3070",
          houseNumber: "3",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
          lessonMode: "in_person",
          skillLevel: "beginner",
          lessonDuration: "min30",
          requestedStartAt: teacherRequestedStartAt,
          status: "pending",
          assignedTeacherId: teacher.id
        },
        {
          name: "Other Request",
          email: "other-request@example.com",
          phone: "0400000004",
          address: "4 Main Street, Northcote VIC 3070",
          houseNumber: "4",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
          lessonMode: "video",
          skillLevel: "advanced",
          lessonDuration: "min60",
          requestedStartAt: otherRequestedStartAt,
          status: "pending",
          assignedTeacherId: otherTeacher.id
        }
      ]
    });

    const bookingsResponse = await listBookings(
      new NextRequest("http://localhost/api/admin/bookings?view=week&date=2026-04-14", {
        headers: authHeaders(token)
      })
    );
    expect(bookingsResponse.status).toBe(200);
    const bookingsBody = (await bookingsResponse.json()) as {
      rows: Array<{ assignedTeacherId: string | null }>;
      requestRows: Array<{ assignedTeacherId: string | null }>;
    };
    expect(bookingsBody.rows).toHaveLength(1);
    expect(bookingsBody.rows[0]?.assignedTeacherId).toBe(teacher.id);
    expect(bookingsBody.requestRows).toHaveLength(1);
    expect(bookingsBody.requestRows[0]?.assignedTeacherId).toBe(teacher.id);

    const requestListResponse = await listBookingRequests(
      new NextRequest("http://localhost/api/admin/booking-requests", {
        headers: authHeaders(token)
      })
    );
    expect(requestListResponse.status).toBe(200);
    const requestListBody = (await requestListResponse.json()) as {
      rows: Array<{ assignedTeacherId: string | null }>;
    };
    expect(requestListBody.rows).toHaveLength(1);
    expect(requestListBody.rows[0]?.assignedTeacherId).toBe(teacher.id);
  });

  it("limits teacher email access to assigned students only", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-email@example.com", "Teacher Email");
    const otherTeacher = await createTeacher("teacher-email-other@example.com", "Teacher Email Other");
    const token = createSessionToken(teacher.email);

    const assignedCustomer = await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name: "Assigned Email Student",
          email: "assigned-email@example.com",
          phone: "0400555000",
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "18",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070"
        }),
        primaryTeacherId: teacher.id
      }
    });

    const otherCustomer = await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name: "Other Email Student",
          email: "other-email@example.com",
          phone: "0400666000",
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "19",
          streetName: "Main",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070"
        }),
        primaryTeacherId: otherTeacher.id
      }
    });

    const allowed = await sendCustomerEmail(
      new NextRequest(`http://localhost/api/admin/customers/${assignedCustomer.id}/email`, {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          subject: "Lesson notes",
          message: "Bring your scales sheet."
        })
      }),
      { params: Promise.resolve({ id: assignedCustomer.id }) }
    );
    expect(allowed.status).toBe(200);

    const forbidden = await sendCustomerEmail(
      new NextRequest(`http://localhost/api/admin/customers/${otherCustomer.id}/email`, {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          subject: "Should fail",
          message: "This teacher should not be able to send."
        })
      }),
      { params: Promise.resolve({ id: otherCustomer.id }) }
    );
    expect(forbidden.status).toBe(403);
  });

  it("limits teacher booking notifications to their assigned lessons", async () => {
    await ensureOwnerAdmin();
    const teacher = await createTeacher("teacher-notify@example.com", "Teacher Notify");
    const otherTeacher = await createTeacher("teacher-notify-other@example.com", "Teacher Notify Other");
    const token = createSessionToken(teacher.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Other Teacher Booking",
        email: "notify-student@example.com",
        phone: "0400777000",
        address: "20 Smith Street, Northcote VIC 3070",
        houseNumber: "20",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: addDays(new Date(), 10),
        endAt: addDays(new Date(), 10),
        timezone: "Australia/Melbourne",
        assignedTeacherId: otherTeacher.id
      }
    });

    const response = await bookingNotify(
      new NextRequest(`http://localhost/api/admin/bookings/${booking.id}/notify`, {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({ action: "reminder" })
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );

    expect(response.status).toBe(403);
  });

  it("allows teachers to self-update their staff profile but blocks editing another teacher", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("teacher-self-a@example.com", "Teacher Self A");
    const teacherB = await createTeacher("teacher-self-b@example.com", "Teacher Self B");
    const token = createSessionToken(teacherA.email);

    const selfResponse = await updateStaff(
      new NextRequest(`http://localhost/api/admin/staff/${teacherA.id}`, {
        method: "PATCH",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          displayName: "Teacher Self Updated",
          instruments: "Guitar, Bass"
        })
      }),
      { params: Promise.resolve({ id: teacherA.id }) }
    );
    expect(selfResponse.status).toBe(200);

    const otherResponse = await updateStaff(
      new NextRequest(`http://localhost/api/admin/staff/${teacherB.id}`, {
        method: "PATCH",
        headers: authHeaders(token, true),
        body: JSON.stringify({
          displayName: "Teacher Self Updated"
        })
      }),
      { params: Promise.resolve({ id: teacherB.id }) }
    );
    expect(otherResponse.status).toBe(403);
  });
});
