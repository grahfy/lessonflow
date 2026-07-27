import fs from "node:fs/promises";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as attachLibraryMaterials } from "@/app/api/admin/bookings/[id]/library-materials/route";
import {
  DELETE as unlinkLibraryMaterial,
  GET as downloadBookingLibraryMaterial
} from "@/app/api/admin/bookings/[id]/library-materials/[libraryItemId]/route";
import { GET as studentBookingLibraryDownload } from "@/app/api/student/bookings/[id]/library-materials/[libraryItemId]/download/route";
import { GET as listMaterials } from "@/app/api/admin/customers/[id]/learning-materials/route";
import { GET as studentPortal } from "@/app/api/student/portal/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

describe("admin-booking-library-materials", () => {
  beforeEach(async () => {
    await prisma.bookingLibraryMaterial.deleteMany();
    await prisma.libraryAssignment.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
    await fs.rm(getLocalMaterialStorageRoot(), { recursive: true, force: true });
  });

  async function setup() {
    const owner = await ensureOwnerAdmin();
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Library Lesson Student",
        email: "booking-library@example.com",
        phone: "0400888999",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "12",
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
        startAt: new Date("2026-12-01T09:00:00.000Z"),
        endAt: new Date("2026-12-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        assignedTeacherId: owner.id
      }
    });
    const storageKey = "library/booking-link-test.pdf";
    await createMaterialStorageDriver().put({
      storageKey,
      buffer: Buffer.from("booking library bytes"),
      mimeType: "application/pdf"
    });
    const item = await prisma.libraryItem.create({
      data: {
        title: "Lesson worksheet",
        materialType: "pdf",
        storageKey,
        mimeType: "application/pdf",
        sizeBytes: 21
      }
    });
    return {
      customer,
      booking,
      item,
      ownerCookie: `${getSessionCookieName()}=${createSessionToken(owner.email)}`,
      studentCookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`
    };
  }

  it("attaches existing Library files to one booking without changing a general assignment", async () => {
    const { customer, booking, item, ownerCookie } = await setup();
    await prisma.libraryAssignment.create({ data: { customerId: customer.id, libraryItemId: item.id } });

    const attachResponse = await attachLibraryMaterials(
      new NextRequest(`http://localhost/api/admin/bookings/${booking.id}/library-materials`, {
        method: "POST",
        headers: { cookie: ownerCookie, "content-type": "application/json" },
        body: JSON.stringify({ libraryItemIds: [item.id, item.id] })
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(attachResponse.status).toBe(201);
    expect(await prisma.bookingLibraryMaterial.count({ where: { bookingId: booking.id, libraryItemId: item.id } })).toBe(1);
    expect(await prisma.libraryAssignment.count({ where: { customerId: customer.id, libraryItemId: item.id } })).toBe(1);

    const bookingList = await listMaterials(
      new NextRequest(`http://localhost/api/admin/customers/${customer.id}/learning-materials?bookingId=${booking.id}`, {
        headers: { cookie: ownerCookie }
      }),
      { params: Promise.resolve({ id: customer.id }) }
    );
    const payload = (await bookingList.json()) as { materials: Array<{ id: string; source?: string; libraryItemId?: string }> };
    expect(payload.materials).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "library_booking", libraryItemId: item.id })
    ]));
    expect(payload.materials).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "library_general" })
    ]));
  });

  it("keeps booking-only Library materials in the booking portal payload and protects the stream", async () => {
    const { booking, item, ownerCookie, studentCookie } = await setup();
    await attachLibraryMaterials(
      new NextRequest(`http://localhost/api/admin/bookings/${booking.id}/library-materials`, {
        method: "POST",
        headers: { cookie: ownerCookie, "content-type": "application/json" },
        body: JSON.stringify({ libraryItemIds: [item.id] })
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );

    const portalResponse = await studentPortal(new NextRequest("http://localhost/api/student/portal", { headers: { cookie: studentCookie } }));
    const portal = (await portalResponse.json()) as { upcoming: Array<{ id: string; materials: Array<{ id: string; downloadUrl: string }> }>; assignedByTeacher?: unknown[] };
    const portalBooking = portal.upcoming.find((row) => row.id === booking.id);
    expect(portalBooking?.materials).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringMatching(/^blm:/), downloadUrl: expect.stringContaining(`/bookings/${booking.id}/library-materials/${item.id}/download`) })
    ]));
    expect(portal.assignedByTeacher).toEqual([]);

    const downloadResponse = await studentBookingLibraryDownload(
      new NextRequest(`http://localhost/api/student/bookings/${booking.id}/library-materials/${item.id}/download`, { headers: { cookie: studentCookie } }),
      { params: Promise.resolve({ id: booking.id, libraryItemId: item.id }) }
    );
    expect(downloadResponse.status).toBe(200);

    const adminStream = await downloadBookingLibraryMaterial(
      new NextRequest(`http://localhost/api/admin/bookings/${booking.id}/library-materials/${item.id}`, { headers: { cookie: ownerCookie } }),
      { params: Promise.resolve({ id: booking.id, libraryItemId: item.id }) }
    );
    expect(adminStream?.status).toBe(200);
  });

  it("unlinks only the selected booking reference", async () => {
    const { customer, booking, item, ownerCookie } = await setup();
    await prisma.libraryAssignment.create({ data: { customerId: customer.id, libraryItemId: item.id } });
    await prisma.bookingLibraryMaterial.create({ data: { bookingId: booking.id, libraryItemId: item.id } });

    const response = await unlinkLibraryMaterial(
      new NextRequest(`http://localhost/api/admin/bookings/${booking.id}/library-materials/${item.id}`, { method: "DELETE", headers: { cookie: ownerCookie } }),
      { params: Promise.resolve({ id: booking.id, libraryItemId: item.id }) }
    );
    expect(response?.status).toBe(200);
    expect(await prisma.bookingLibraryMaterial.count()).toBe(0);
    expect(await prisma.libraryAssignment.count()).toBe(1);
    expect(await prisma.libraryItem.count()).toBe(1);
  });
});
