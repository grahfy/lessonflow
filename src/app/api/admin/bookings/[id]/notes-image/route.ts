import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import {
  InvalidNoteImageContentError,
  MAX_NOTE_IMAGE_SIZE,
  buildBookingNoteImageStorageKey,
  buildBookingNoteImageUrl,
  createNoteImageRecordWithRollback,
  resolveNoteImageExtension,
  storeNoteImageFile,
} from "@/lib/note-images";

type Params = {
  params: Promise<{ id: string }>;
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

    if (file.size <= 0 || file.size > MAX_NOTE_IMAGE_SIZE) {
      return NextResponse.json({ error: "Image must be between 1 byte and 5 MB." }, { status: 400 });
    }

    const ext = resolveNoteImageExtension(file.type);
    if (!ext) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, GIF, and WebP images are allowed." },
        { status: 400 }
      );
    }

    const imageId = randomUUID();
    const storageKey = buildBookingNoteImageStorageKey(id, imageId, ext);

    await storeNoteImageFile({ file, storageKey });

    const record = await createNoteImageRecordWithRollback({
      db: prisma,
      storageKey,
      scope: "booking_note_image",
      entityId: id,
      createRecord: () =>
        prisma.bookingNoteImage.create({
          data: {
            id: imageId,
            bookingId: id,
            storageKey,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        }),
    });

    return NextResponse.json({
      id: record.id,
      url: buildBookingNoteImageUrl(id, record.id),
    });
  } catch (error) {
    if (error instanceof InvalidNoteImageContentError) {
      return NextResponse.json(
        { error: "Image must be a valid PNG, JPEG, GIF, or WebP file." },
        { status: 400 }
      );
    }
    return jsonUnexpectedError(error, "Unable to upload booking note image.");
  }
}
