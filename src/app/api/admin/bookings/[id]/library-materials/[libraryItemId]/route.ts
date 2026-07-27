import { NextRequest, NextResponse } from "next/server";

import { getAuthorizedBookingLibraryContext } from "@/lib/admin/booking-library-material-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { streamMaterialBlob } from "@/lib/student-portal/material-response";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

type Params = { params: Promise<{ id: string; libraryItemId: string }> };

async function authorize(request: NextRequest, params: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { id: bookingId, libraryItemId } = await params.params;
  const context = await getAuthorizedBookingLibraryContext(admin, bookingId);
  if (context.kind === "not_found") return { response: NextResponse.json({ error: "Booking not found." }, { status: 404 }) };
  if (context.kind === "forbidden") return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { admin, bookingId, libraryItemId };
}

/** Streams a Library master only when it is attached to the authorized booking. */
export async function GET(request: NextRequest, params: Params) {
  try {
    const auth = await authorize(request, params);
    if ("response" in auth) return auth.response;
    const link = await prisma.bookingLibraryMaterial.findUnique({
      where: { bookingId_libraryItemId: { bookingId: auth.bookingId, libraryItemId: auth.libraryItemId } },
      include: { libraryItem: true }
    });
    if (!link) return NextResponse.json({ error: "Library material not found." }, { status: 404 });
    return streamMaterialBlob(
      createMaterialStorageDriver(),
      {
        storageKey: link.libraryItem.storageKey,
        mimeType: link.libraryItem.mimeType,
        title: link.libraryItem.title,
        materialType: link.libraryItem.materialType,
        originalFilename: link.libraryItem.originalFilename
      },
      request,
      { notFoundMessage: "Library material not found." }
    );
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load Library material.");
  }
}

/** Removes just this booking's reference, never the shared Library master. */
export async function DELETE(request: NextRequest, params: Params) {
  try {
    const auth = await authorize(request, params);
    if ("response" in auth) return auth.response;
    const removed = await prisma.bookingLibraryMaterial.deleteMany({
      where: { bookingId: auth.bookingId, libraryItemId: auth.libraryItemId }
    });
    if (!removed.count) return NextResponse.json({ error: "Library material not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to unlink Library material.");
  }
}
