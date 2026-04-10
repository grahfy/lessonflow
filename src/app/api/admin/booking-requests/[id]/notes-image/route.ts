import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import {
  MAX_NOTE_IMAGE_SIZE,
  buildBookingRequestNoteImageStorageKey,
  buildBookingRequestNoteImageUrl,
  createNoteImageRecordWithRollback,
  resolveNoteImageExtension,
  storeNoteImageFile,
} from "@/lib/note-images";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const bookingRequest = await prisma.bookingRequest.findUnique({ where: { id } });
    if (!bookingRequest) {
      return NextResponse.json({ error: "Booking request not found." }, { status: 404 });
    }

    if (!canManageAssignedTeacher(admin, bookingRequest.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (bookingRequest.status !== "pending") {
      return NextResponse.json({ error: "Only pending requests can accept note images." }, { status: 400 });
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

    const extension = resolveNoteImageExtension(file.type);
    if (!extension) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, GIF, and WebP images are allowed." },
        { status: 400 }
      );
    }

    const imageId = randomUUID();
    const storageKey = buildBookingRequestNoteImageStorageKey(id, imageId, extension);
    await storeNoteImageFile({ file, storageKey });

    const record = await createNoteImageRecordWithRollback({
      db: prisma,
      storageKey,
      scope: "booking_request_note_image",
      entityId: id,
      createRecord: () =>
        prisma.bookingRequestNoteImage.create({
          data: {
            id: imageId,
            bookingRequestId: id,
            storageKey,
            mimeType: file.type,
            sizeBytes: file.size,
          }
        }),
    });

    return NextResponse.json({
      id: record.id,
      url: buildBookingRequestNoteImageUrl(id, record.id),
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to upload booking request note image.");
  }
}
