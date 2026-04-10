import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/admin/booking-requests/[id]/route";
import * as bookingEvents from "@/lib/booking-events";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { buildBookingRequestNoteImageUrl } from "@/lib/note-images";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

function adminPatch(id: string, token: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/booking-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

/**
 * Shared request fixture so approval tests stay focused on downstream effects
 * like customer linking, booking creation, and portal credential delivery.
 */
function baseRequestData(overrides?: Partial<Parameters<typeof prisma.bookingRequest.create>[0]["data"]>) {
  return {
    firstName: "Alex",
    lastName: "Student",
    name: "Alex Student",
    email: "alex.student@example.com",
    phone: "0400123456",
    address: "66 High Street, Northcote VIC 3070",
    houseNumber: "66",
    streetName: "High",
    streetType: "Street",
    suburb: "Northcote",
    state: "VIC",
    postcode: "3070",
    lessonMode: "in_person" as const,
    skillLevel: "beginner" as const,
    lessonDuration: "min60" as const,
    requestedStartAt: new Date("2026-06-03T09:00:00.000Z"),
    status: "pending" as const,
    ...overrides
  };
}

describe("admin-booking-approval-portal-credential", () => {
  beforeEach(async () => {
    // RATIONALE: Approval can fan out into bookings, emails, audit logs, and
    // portal credentials, so the cleanup order mirrors those dependencies.
    await prisma.bookingRequestNoteImage.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("resolves customer, persists customerId, and sends first-time portal credentials on approval", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData()
    });

    const response = await PATCH(
      adminPatch(requestRow.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );
    expect(response.status).toBe(202);
    const payload = (await response.json()) as {
      ok?: boolean;
      partial?: boolean;
      deliveryStatus?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.partial).toBe(true);
    expect(payload.deliveryStatus).toBe("queued_no_smtp");

    const approvedRequest = await prisma.bookingRequest.findUniqueOrThrow({
      where: {
        id: requestRow.id
      }
    });
    expect(approvedRequest.status).toBe("approved");
    expect(approvedRequest.customerId).toBeTruthy();

    const booking = await prisma.booking.findFirstOrThrow({
      where: {
        requestId: requestRow.id
      }
    });
    expect(booking.customerId).toBe(approvedRequest.customerId);

    const credential = await prisma.customerPortalCredential.findUnique({
      where: {
        customerId: approvedRequest.customerId || ""
      }
    });
    expect(credential).not.toBeNull();

    const emailRow = await prisma.outboundEmail.findFirstOrThrow({
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(emailRow.toEmail).toBe("alex.student@example.com");
    expect(emailRow.subject).toContain("approved");
    expect(emailRow.htmlBody).toContain("/student/login");
    expect(emailRow.htmlBody).toContain("Temporary password");
    expect(emailRow.status).toBe("queued_no_smtp");
  });

  it("does not rotate portal credentials on later approvals for same customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const firstRequest = await prisma.bookingRequest.create({
      data: baseRequestData()
    });
    const secondRequest = await prisma.bookingRequest.create({
      data: baseRequestData({
        requestedStartAt: new Date("2026-06-10T09:00:00.000Z"),
        notes: "Second lesson request"
      })
    });

    await PATCH(
      adminPatch(firstRequest.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: firstRequest.id }) }
    );
    const credentialAfterFirst = await prisma.customerPortalCredential.findFirstOrThrow();
    const firstEmail = await prisma.outboundEmail.findFirstOrThrow({
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(firstEmail.htmlBody).toContain("Temporary password");

    await PATCH(
      adminPatch(secondRequest.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: secondRequest.id }) }
    );

    // NOTE: The same customer should be matched and reuse the existing portal
    // credential, but an approval email still goes out for the new booking.
    const credentials = await prisma.customerPortalCredential.findMany();
    expect(credentials).toHaveLength(1);
    expect(credentials[0]?.id).toBe(credentialAfterFirst.id);

    const emails = await prisma.outboundEmail.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(emails).toHaveLength(2);
    expect(emails[0]?.status).toBe("queued_no_smtp");
    expect(emails[1]?.status).toBe("queued_no_smtp");
    expect(emails[1]?.htmlBody).not.toContain("Temporary password");
  });

  it("preserves first/last names when approving recurring requests", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const startAt = new Date("2026-06-03T09:00:00.000Z");
    const recurrenceEndAt = new Date("2026-06-24T09:00:00.000Z");

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData({
        isRecurring: true,
        recurrenceEndAt,
        requestedStartAt: startAt
      })
    });

    const response = await PATCH(
      adminPatch(requestRow.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );
    expect(response.status).toBe(202);
    const payload = (await response.json()) as {
      ok?: boolean;
      partial?: boolean;
      deliveryStatus?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.partial).toBe(true);
    expect(payload.deliveryStatus).toBe("queued_no_smtp");

    const createdBookings = await prisma.booking.findMany({
      where: { requestId: requestRow.id },
      orderBy: { startAt: "asc" }
    });
    expect(createdBookings.length).toBeGreaterThan(1);
    // RATIONALE: Recurring approvals create derived bookings plus a series row;
    // both must retain the split first/last name fields for later editing.
    for (const booking of createdBookings) {
      expect(booking.firstName).toBe("Alex");
      expect(booking.lastName).toBe("Student");
    }

    const series = await prisma.bookingSeries.findFirst({
      where: { customerId: createdBookings[0]?.customerId || "" }
    });
    expect(series?.firstName).toBe("Alex");
    expect(series?.lastName).toBe("Student");
  });

  it("returns partial success when approval persists but notification delivery fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData({
        email: "partial-approval@example.com"
      })
    });

    vi.spyOn(bookingEvents, "sendCustomerBookingStatusEmail").mockRejectedValueOnce(new Error("smtp offline"));

    const response = await PATCH(
      adminPatch(requestRow.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as { ok?: boolean; partial?: boolean; warning?: string };
    expect(body.ok).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.warning).toContain("notification email");

    const approvedRequest = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(approvedRequest.status).toBe("approved");

    const booking = await prisma.booking.findFirst({
      where: { requestId: requestRow.id }
    });
    expect(booking).not.toBeNull();
  });

  it("returns partial success when approval persists but delivery reports failed without throwing", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData({
        email: "failed-status-approval@example.com"
      })
    });

    vi.spyOn(bookingEvents, "sendCustomerBookingStatusEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const response = await PATCH(
      adminPatch(requestRow.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      ok?: boolean;
      partial?: boolean;
      warning?: string;
      deliveryStatus?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.warning).toContain("smtp offline");
    expect(body.deliveryStatus).toBe("failed");

    const approvedRequest = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(approvedRequest.status).toBe("approved");
  });

  it("returns partial success when approval persists but no live mail provider is configured", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData({
        email: "queued-status-approval@example.com"
      })
    });

    vi.spyOn(bookingEvents, "sendCustomerBookingStatusEmail").mockResolvedValueOnce({
      status: "queued_no_smtp"
    });

    const response = await PATCH(
      adminPatch(requestRow.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      ok?: boolean;
      partial?: boolean;
      warning?: string;
      deliveryStatus?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.warning).toContain("notification email");
    expect(body.deliveryStatus).toBe("queued_no_smtp");

    const approvedRequest = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(approvedRequest.status).toBe("approved");
  });

  it("copies request rich notes and images into approved bookings", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData({
        notes: "Worked on chord transitions",
        notesContent: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Worked on chord transitions" }],
            },
            {
              type: "image",
              attrs: {
                src: buildBookingRequestNoteImageUrl("REQUEST_ID", "request-image-1"),
                alt: "Reference",
              },
            },
          ],
        },
      })
    });

    await prisma.bookingRequest.update({
      where: { id: requestRow.id },
      data: {
        notesContent: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Worked on chord transitions" }],
            },
            {
              type: "image",
              attrs: {
                src: buildBookingRequestNoteImageUrl(requestRow.id, "request-image-1"),
                alt: "Reference",
              },
            },
          ],
        },
      }
    });

    const driver = createMaterialStorageDriver();
    await driver.put({
      storageKey: "booking-requests/request-copy-test/notes/request-image-1.png",
      buffer: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]),
      mimeType: "image/png",
    });

    await prisma.bookingRequestNoteImage.create({
      data: {
        id: "request-image-1",
        bookingRequestId: requestRow.id,
        storageKey: "booking-requests/request-copy-test/notes/request-image-1.png",
        mimeType: "image/png",
        sizeBytes: 68,
      }
    });

    const response = await PATCH(
      adminPatch(requestRow.id, token, { action: "approve" }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );
    expect(response.status).toBe(202);

    const booking = await prisma.booking.findFirstOrThrow({
      where: { requestId: requestRow.id }
    });
    expect(booking.notes).toContain("Worked on chord transitions");
    expect(booking.notesContent).toBeTruthy();

    const noteImages = await prisma.bookingNoteImage.findMany({
      where: { bookingId: booking.id }
    });
    expect(noteImages).toHaveLength(1);

    const requestImages = await prisma.bookingRequestNoteImage.findMany({
      where: { bookingRequestId: requestRow.id }
    });
    expect(requestImages).toHaveLength(1);
    await expect(
      driver.get({ storageKey: "booking-requests/request-copy-test/notes/request-image-1.png" })
    ).resolves.toEqual(
      expect.objectContaining({
        buffer: expect.any(Buffer),
      })
    );

    const storedDoc = booking.notesContent as { content?: Array<{ attrs?: { src?: string } }> };
    const imageNode = storedDoc.content?.find((node) => node.attrs?.src);
    expect(imageNode?.attrs?.src).toContain(`/api/admin/bookings/${booking.id}/notes-image/`);
    expect(imageNode?.attrs?.src).not.toContain(`/api/admin/booking-requests/${requestRow.id}/notes-image/`);
  });
});
