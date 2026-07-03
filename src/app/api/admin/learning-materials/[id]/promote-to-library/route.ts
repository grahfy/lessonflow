import { NextRequest, NextResponse } from "next/server";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { promoteMaterialToLibrary } from "@/lib/library/library-service";
import { logError, logEvent } from "@/lib/observability";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * "Add to library" — promotes an existing per-customer LearningMaterial into the
 * shared library by COPYING its bytes into a new `library/` blob + LibraryItem
 * (the source is never modified or deleted, AC8/AC14).
 *
 * SECURITY (Principle 6 / AC8b / pre-mortem S4): the library WRITE is open to any
 * admin, but you may only promote bytes you are ALREADY entitled to READ. So the
 * SOURCE-material read is gated by the SAME two-tier per-customer predicate the
 * existing material-read route uses (canManagePrimaryTeacherCustomer + booking-tier
 * canManageAssignedTeacher) — NOT by canManageLibrary. Both tiers must pass BEFORE
 * any storage.get / storage.put / LibraryItem create runs, so the scoping bypass
 * never grants new read access to private per-customer bytes.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const material = await prisma.learningMaterial.findUnique({
      where: { id },
      include: {
        customer: {
          select: { primaryTeacherId: true }
        },
        booking: {
          select: { assignedTeacherId: true }
        }
      }
    });
    if (!material) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
    }

    // TWO-TIER SOURCE-READ GATE — must run before any blob/DB write. A 403 here is
    // a probing signal for the S4 cross-teacher leak, so emit a distinct event.
    if (!canManagePrimaryTeacherCustomer(admin, material.customer.primaryTeacherId)) {
      logEvent("library.promote_denied", { adminId: admin.id, materialId: material.id, tier: "primaryTeacher" });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (material.bookingId && !canManageAssignedTeacher(admin, material.booking?.assignedTeacherId)) {
      logEvent("library.promote_denied", { adminId: admin.id, materialId: material.id, tier: "assignedTeacher" });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only after BOTH tiers pass do we read the source bytes and create the item.
    try {
      const item = await promoteMaterialToLibrary({
        source: {
          storageKey: material.storageKey,
          title: material.title,
          description: material.description,
          materialType: material.materialType,
          mimeType: material.mimeType,
          sizeBytes: material.sizeBytes
        },
        uploadedById: admin.id
      });

      return NextResponse.json(
        {
          item: {
            id: item.id,
            title: item.title,
            description: item.description,
            materialType: item.materialType,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
            createdAt: item.createdAt.toISOString()
          }
        },
        { status: 201 }
      );
    } catch (error) {
      logError("library.promote_failed", error, { materialId: material.id });
      return NextResponse.json({ error: "Unable to add material to the library." }, { status: 500 });
    }
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to add material to the library.");
  }
}
