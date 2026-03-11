import fs from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as downloadMaterial } from "@/app/api/student/learning-materials/[id]/download/route";
import { GET as studentPortal } from "@/app/api/student/portal/route";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { studentPortalPayloadSchema } from "@/lib/student-portal/contracts";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

describe("student-portal-data", () => {
  beforeEach(async () => {
    // RATIONALE: Portal responses depend on both relational DB rows and the
    // on-disk materials store, so each scenario resets both surfaces.
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await fs.rm(process.env.LEARNING_MATERIALS_LOCAL_ROOT || ".data/learning-materials-test", {
      recursive: true,
      force: true
    });
  });

  it("returns upcoming/previous appointments and material links", async () => {
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Dana Student",
        email: "dana@example.com",
        phone: "0400999000",
        lessonMode: "video",
        skillLevel: "intermediate",
        unitNumber: undefined,
        houseNumber: "9",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });

    const previousBooking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "9 Main Street, Northcote VIC 3070",
        houseNumber: "9",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        startAt: new Date("2026-02-01T09:00:00.000Z"),
        endAt: new Date("2026-02-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });
    const upcomingBooking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "9 Main Street, Northcote VIC 3070",
        houseNumber: "9",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        startAt: new Date("2026-12-01T09:00:00.000Z"),
        endAt: new Date("2026-12-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });

    const storage = createMaterialStorageDriver();
    const storageKey = `${customer.id}/${upcomingBooking.id}/material.pdf`;
    await storage.put({
      storageKey,
      buffer: Buffer.from("lesson material"),
      mimeType: "application/pdf"
    });
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: upcomingBooking.id,
        title: "Scale practice",
        materialType: "pdf",
        storageKey,
        mimeType: "application/pdf",
        sizeBytes: 15
      }
    });

    const cookie = `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`;
    const portalRequest = new NextRequest("http://localhost/api/student/portal", {
      headers: {
        cookie
      }
    });
    const portalResponse = await studentPortal(portalRequest);
    expect(portalResponse.status).toBe(200);
    const payload = studentPortalPayloadSchema.parse(await portalResponse.json());
    // NOTE: The contract intentionally separates upcoming vs previous lessons so
    // the portal UI can render next actions before history/archive content.
    expect(payload.upcoming.map((row) => row.id)).toContain(upcomingBooking.id);
    expect(payload.previous.map((row) => row.id)).toContain(previousBooking.id);
    expect(payload.upcoming[0]?.materials[0]?.id).toBe(material.id);
    expect(payload.upcoming[0]?.materials[0]?.downloadUrl).toContain(`/api/student/learning-materials/${material.id}/download`);
  });

  it("streams owned learning material downloads", async () => {
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Download Student",
        email: "download@example.com",
        phone: "0400222333",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "4",
        streetName: "Short",
        streetType: "Street",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056"
      })
    });
    const booking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "4 Short Street, Brunswick VIC 3056",
        houseNumber: "4",
        streetName: "Short",
        streetType: "Street",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        startAt: new Date("2026-12-10T09:00:00.000Z"),
        endAt: new Date("2026-12-10T09:30:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });

    const storage = createMaterialStorageDriver();
    const storageKey = `${customer.id}/${booking.id}/warmup.mp3`;
    await storage.put({
      storageKey,
      buffer: Buffer.from("audio-bytes"),
      mimeType: "audio/mpeg"
    });
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: booking.id,
        title: "Warmup track",
        materialType: "audio",
        storageKey,
        mimeType: "audio/mpeg",
        sizeBytes: 11
      }
    });

    const request = new NextRequest(`http://localhost/api/student/learning-materials/${material.id}/download`, {
      headers: {
        cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`
      }
    });
    const response = await downloadMaterial(request, {
      params: Promise.resolve({ id: material.id })
    });
    expect(response.status).toBe(200);
    // RATIONALE: These assertions guard the actual download contract that media
    // players and browser save dialogs rely on, not just route reachability.
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-disposition") || "").toContain("Warmup track");
  });
});
