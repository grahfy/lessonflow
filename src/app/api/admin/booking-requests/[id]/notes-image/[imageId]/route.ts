import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

type Params = {
  params: Promise<{ id: string; imageId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, imageId } = await params;
    const image = await prisma.bookingRequestNoteImage.findFirst({
      where: { id: imageId, bookingRequestId: id },
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
    return jsonUnexpectedError(error, "Unable to serve booking request note image.");
  }
}
