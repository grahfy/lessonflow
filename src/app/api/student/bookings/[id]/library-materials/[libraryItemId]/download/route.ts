import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { streamMaterialBlob } from "@/lib/student-portal/material-response";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

type Params = { params: Promise<{ id: string; libraryItemId: string }> };

/** Streams a shared file only when it is linked to one of the student's bookings. */
export async function GET(request: NextRequest, { params }: Params) {
  const student = await requireStudentFromRequest(request);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: bookingId, libraryItemId } = await params;
  const link = await prisma.bookingLibraryMaterial.findFirst({
    where: { bookingId, libraryItemId, booking: { customerId: student.id } },
    include: { libraryItem: true }
  });
  if (!link) return NextResponse.json({ error: "Material not found or access denied." }, { status: 404 });

  return streamMaterialBlob(
    createMaterialStorageDriver(),
    {
      storageKey: link.libraryItem.storageKey,
      mimeType: link.libraryItem.mimeType,
      title: link.libraryItem.title,
      materialType: link.libraryItem.materialType,
      originalFilename: link.libraryItem.originalFilename
    },
    request
  );
}
