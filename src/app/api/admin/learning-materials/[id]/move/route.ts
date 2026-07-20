import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { assertSameCustomerFolder, FolderValidationError } from "@/lib/student-portal/folders";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const moveMaterialSchema = z.object({
  folderId: z.string().trim().min(1).nullable()
});

/**
 * Moves one learning material into a folder (or to root). Only `folderId` is
 * touched — `storageKey` is never regenerated (Principle 2). (AC-8)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const material = await prisma.learningMaterial.findUnique({
      where: {
        id
      },
      include: {
        customer: {
          select: {
            primaryTeacherId: true
          }
        },
        booking: {
          select: {
            assignedTeacherId: true
          }
        }
      }
    });
    if (!material) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, material.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // INV-4: a booking-linked material can only be moved by the assigned teacher.
    if (material.bookingId && !canManageAssignedTeacher(admin, material.booking?.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = moveMaterialSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid move target.", details: parsed.error.flatten() }, { status: 400 });
    }

    const targetFolderId = parsed.data.folderId;

    // Validate the destination folder exists and belongs to the same customer (INV-3).
    if (targetFolderId) {
      const folder = await prisma.studentMaterialFolder.findUnique({
        where: {
          id: targetFolderId
        }
      });
      if (!folder) {
        return NextResponse.json({ error: "Target folder not found." }, { status: 400 });
      }
      assertSameCustomerFolder(material.customerId, folder);
    }

    const updated = await prisma.learningMaterial.update({
      where: {
        id: material.id
      },
      data: {
        folderId: targetFolderId,
        // Relocating writes reset the order key so a stale index from the old
        // folder is never carried into the new one (0 = unpinned, sorts on top).
        sortOrder: 0
      }
    });

    return NextResponse.json({
      material: {
        id: updated.id,
        folderId: updated.folderId
      }
    });
  } catch (error) {
    if (error instanceof FolderValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return jsonUnexpectedError(error, "Unable to move learning material.");
  }
}
