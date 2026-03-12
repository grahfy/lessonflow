import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as bookingNotify } from "@/app/api/admin/bookings/[id]/notify/route";
import { POST as createBooking } from "@/app/api/admin/bookings/route";
import { PATCH as updateBooking } from "@/app/api/admin/bookings/[id]/route";
import { POST as sendCustomerEmail } from "@/app/api/admin/customers/[id]/email/route";
import { PATCH as updateCustomer } from "@/app/api/admin/customers/[id]/route";
import { GET as listInvoices } from "@/app/api/admin/invoices/route";
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
