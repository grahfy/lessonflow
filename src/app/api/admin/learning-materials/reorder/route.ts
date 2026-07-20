import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { REORDER_MAX_IDS, reorderMaterials } from "@/lib/materials/reorder";

/**
 * Moves and reorders a folder's materials in one atomic write. Only `folderId`
 * and `sortOrder` are touched — `storageKey`, `title` and `mimeType` never
 * appear in any SET clause and `storageKey` is never regenerated (Principle 2).
 *
 * The per-id move route (`learning-materials/[id]/move`) stays for the dialog.
 */
const reorderSchema = z.object({
  customerId: z.string().trim().min(1),
  folderId: z.string().trim().min(1).nullable(),
  movedId: z.string().trim().min(1).nullable(),
  orderedIds: z.array(z.string().min(1)).min(1).max(REORDER_MAX_IDS)
});

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reorder.", details: parsed.error.flatten() }, { status: 400 });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, isArchived: false },
      select: { id: true, primaryTeacherId: true }
    });
    if (!customer) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await reorderMaterials(
      {
        customerId: customer.id,
        folderId: parsed.data.folderId,
        movedId: parsed.data.movedId,
        orderedIds: parsed.data.orderedIds
      },
      { canManageBooking: (assignedTeacherId) => canManageAssignedTeacher(admin, assignedTeacherId) }
    );

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return NextResponse.json({ error: "Not found." }, { status: 404 });
        case "cross_customer":
          return NextResponse.json({ error: "Target folder not found.", code: "CROSS_CUSTOMER" }, { status: 400 });
        case "forbidden_booking":
          return NextResponse.json({ error: "Forbidden." }, { status: 403 });
        case "stale":
          return NextResponse.json({ error: "Materials changed.", code: "STALE_ORDER" }, { status: 409 });
      }
    }

    return NextResponse.json({ materials: result.materials });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to reorder learning materials.");
  }
}
