import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

type Params = {
  params: Promise<{ id: string }>;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Upload an image for embedding in booking notes (TipTap rich text).
 * Stores the image via the material storage driver and returns a URL
 * that the editor inserts as an `<img>` node.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (!canManageAssignedTeacher(admin, booking.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "Image must be between 1 byte and 5 MB." }, { status: 400 });
    }

    const ext = ALLOWED_MIME_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, GIF, and WebP images are allowed." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageId = randomUUID();
    const storageKey = `bookings/${id}/notes/${imageId}.${ext}`;

    const driver = createMaterialStorageDriver();
    await driver.put({ storageKey, buffer, mimeType: file.type });

    const record = await prisma.bookingNoteImage.create({
      data: {
        id: imageId,
        bookingId: id,
        storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    return NextResponse.json({
      id: record.id,
      url: `/api/admin/bookings/${id}/notes-image/${record.id}`,
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to upload booking note image.");
  }
}
