import fs from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/admin/customers/[id]/learning-materials/route";
import { DELETE } from "@/app/api/admin/learning-materials/[id]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

describe("admin-learning-materials", () => {
  beforeEach(async () => {
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

  async function createCustomer(name: string, email: string, phone: string, postcode: string) {
    return prisma.customer.create({
      data: customerSnapshotFromInput({
        name,
        email,
        phone,
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "12",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode
      })
    });
  }

  async function createBooking(customerId: string, email: string, phone: string) {
    return prisma.booking.create({
      data: {
        name: "Lesson Student",
        email,
        phone,
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
        startAt: new Date("2026-07-01T09:00:00.000Z"),
        endAt: new Date("2026-07-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId
      }
    });
  }

  it("uploads, lists, and deletes appointment-linked learning materials", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookie = `${getSessionCookieName()}=${token}`;

    const customer = await createCustomer("Material Student", "materials@example.com", "0400999000", "3070");
    const booking = await createBooking(customer.id, customer.email, customer.phone);

    const uploadForm = new FormData();
    uploadForm.set("bookingId", booking.id);
    uploadForm.set("title", "Chord chart");
    uploadForm.set("description", "Practice this chord transition slowly");
    uploadForm.set(
      "file",
      new File([Buffer.from("pdf-content")], "chord-chart.pdf", {
        type: "application/pdf"
      })
    );

    const uploadRequest = new NextRequest(`http://localhost/api/admin/customers/${customer.id}/learning-materials`, {
      method: "POST",
      body: uploadForm,
      headers: {
        cookie
      }
    });
    const uploadResponse = await POST(uploadRequest, {
      params: Promise.resolve({ id: customer.id })
    });
    expect(uploadResponse.status).toBe(201);
    const uploadPayload = (await uploadResponse.json()) as { material: { id: string } };

    const listRequest = new NextRequest(
      `http://localhost/api/admin/customers/${customer.id}/learning-materials?bookingId=${booking.id}`,
      {
        headers: {
          cookie
        }
      }
    );
    const listResponse = await GET(listRequest, {
      params: Promise.resolve({ id: customer.id })
    });
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as {
      materials: Array<{ id: string; bookingId: string; description: string | null }>;
    };
    expect(listPayload.materials.map((material) => material.id)).toContain(uploadPayload.material.id);
    expect(listPayload.materials[0]?.bookingId).toBe(booking.id);
    expect(listPayload.materials[0]?.description).toBe("Practice this chord transition slowly");

    const deleteRequest = new NextRequest(`http://localhost/api/admin/learning-materials/${uploadPayload.material.id}`, {
      method: "DELETE",
      headers: {
        cookie
      }
    });
    const deleteResponse = await DELETE(deleteRequest, {
      params: Promise.resolve({ id: uploadPayload.material.id })
    });
    expect(deleteResponse.status).toBe(200);

    const remaining = await prisma.learningMaterial.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("rejects uploads when selected booking is not owned by the customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookie = `${getSessionCookieName()}=${token}`;

    const customerA = await createCustomer("Customer A", "a@example.com", "0400111111", "3070");
    const customerB = await createCustomer("Customer B", "b@example.com", "0400222222", "3070");
    const bookingB = await createBooking(customerB.id, customerB.email, customerB.phone);

    const uploadForm = new FormData();
    uploadForm.set("bookingId", bookingB.id);
    uploadForm.set(
      "file",
      new File([Buffer.from("audio-content")], "warmup.mp3", {
        type: "audio/mpeg"
      })
    );

    const uploadRequest = new NextRequest(`http://localhost/api/admin/customers/${customerA.id}/learning-materials`, {
      method: "POST",
      body: uploadForm,
      headers: {
        cookie
      }
    });
    const uploadResponse = await POST(uploadRequest, {
      params: Promise.resolve({ id: customerA.id })
    });
    expect(uploadResponse.status).toBe(400);
  });

  it("uploads and handles image files", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookie = `${getSessionCookieName()}=${token}`;

    const customer = await createCustomer("Image Student", "image@example.com", "0400555666", "3070");

    const uploadForm = new FormData();
    uploadForm.set("title", "Lesson Photo");
    uploadForm.set(
      "file",
      new File([Buffer.from("fake-image-binary-data")], "lesson.jpg", {
        type: "image/jpeg"
      })
    );

    const uploadRequest = new NextRequest(`http://localhost/api/admin/customers/${customer.id}/learning-materials`, {
      method: "POST",
      body: uploadForm,
      headers: { cookie }
    });
    const uploadResponse = await POST(uploadRequest, {
      params: Promise.resolve({ id: customer.id })
    });
    expect(uploadResponse.status).toBe(201);

    const { material } = (await uploadResponse.json()) as { material: any };
    expect(material.materialType).toBe("image");
    expect(material.mimeType).toBe("image/jpeg");

    // Verify retrieval
    const dbMaterial = await prisma.learningMaterial.findUnique({ where: { id: material.id } });
    expect(dbMaterial?.materialType).toBe("image");
  });
});
