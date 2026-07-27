import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedBookingLibraryContext } from "@/lib/admin/booking-library-material-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const attachSchema = z.object({
  libraryItemIds: z.array(z.string().trim().min(1)).min(1).max(100)
});

/** Attaches existing shared Library files to one booking by reference. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: bookingId } = await params;
    const context = await getAuthorizedBookingLibraryContext(admin, bookingId);
    if (context.kind === "not_found") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (context.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = attachSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Library selection.", details: parsed.error.flatten() }, { status: 400 });
    }

    const libraryItemIds = Array.from(new Set(parsed.data.libraryItemIds));
    const found = await prisma.libraryItem.findMany({
      where: { id: { in: libraryItemIds } },
      select: { id: true }
    });
    const foundIds = new Set(found.map((item) => item.id));
    const missingIds = libraryItemIds.filter((itemId) => !foundIds.has(itemId));
    if (missingIds.length) {
      return NextResponse.json({ error: "One or more Library files no longer exist.", missingIds }, { status: 400 });
    }

    const created = await prisma.bookingLibraryMaterial.createMany({
      data: libraryItemIds.map((libraryItemId) => ({
        bookingId: context.booking.id,
        libraryItemId,
        assignedById: admin.id
      })),
      skipDuplicates: true
    });

    return NextResponse.json({ ok: true, created: created.count }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to attach Library materials.");
  }
}
