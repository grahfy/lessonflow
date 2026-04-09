import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

type Params = {
  params: Promise<{ bookingId: string; imageId: string }>;
};

/**
 * Serves a booking note image to the authenticated student who owns the booking.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId, imageId } = await params;

    // Verify the booking belongs to this student.
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, customerId: student.id },
    });
    if (!booking) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const image = await prisma.bookingNoteImage.findFirst({
      where: { id: imageId, bookingId },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    const driver = createMaterialStorageDriver();
    const blob = await driver.get({ storageKey: image.storageKey });

    return new NextResponse(new Uint8Array(blob.buffer), {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(image.sizeBytes),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to serve booking note image.");
  }
}
