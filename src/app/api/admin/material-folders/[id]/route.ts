import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import {
  assertUniqueSiblingName,
  assertNoCycle,
  assertSameCustomerFolder,
  FolderValidationError
} from "@/lib/student-portal/folders";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().trim().min(1).nullable().optional()
});

/**
 * Updates a folder's name and/or moves it to another parent folder.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const folder = await prisma.studentMaterialFolder.findUnique({
      where: {
        id
      },
      include: {
        customer: {
          select: {
            primaryTeacherId: true
          }
        }
      }
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, folder.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = updateFolderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid folder details.", details: parsed.error.flatten() }, { status: 400 });
    }

    const targetParentId = parsed.data.parentId !== undefined ? parsed.data.parentId : folder.parentId;
    const targetName = parsed.data.name !== undefined ? parsed.data.name : folder.name;

    // Validate the destination parent folder belongs to the same customer (INV-3)
    if (parsed.data.parentId !== undefined && targetParentId !== null) {
      const parentFolder = await prisma.studentMaterialFolder.findUnique({
        where: { id: targetParentId }
      });
      if (!parentFolder) {
        return NextResponse.json({ error: "Target parent folder not found." }, { status: 400 });
      }
      assertSameCustomerFolder(folder.customerId, parentFolder);
    }

    const allFolders = await prisma.studentMaterialFolder.findMany({
      where: { customerId: folder.customerId }
    });

    // Enforce cycle check if parentId is changing (INV-2)
    if (parsed.data.parentId !== undefined) {
      assertNoCycle(folder.id, targetParentId, allFolders);
    }

    // Enforce unique sibling name check
    const siblings = allFolders.filter((f) => f.parentId === targetParentId);
    const name = assertUniqueSiblingName({
      name: targetName,
      customerId: folder.customerId,
      parentId: targetParentId,
      siblings,
      excludeId: folder.id
    });

    const updated = await prisma.studentMaterialFolder.update({
      where: {
        id: folder.id
      },
      data: {
        name,
        parentId: targetParentId
      }
    });

    return NextResponse.json({
      folder: {
        id: updated.id,
        parentId: updated.parentId,
        name: updated.name,
        sourceBookingId: updated.sourceBookingId
      }
    });
  } catch (error) {
    if (error instanceof FolderValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return jsonUnexpectedError(error, "Unable to update material folder.");
  }
}

/**
 * Deletes a folder after relocating its direct contents (materials + subfolders)
 * up one level to its parent (or root). All writes run in one transaction so the
 * tree never has a dangling reference. (AC-4/AC-7)
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const folder = await prisma.studentMaterialFolder.findUnique({
      where: {
        id
      },
      include: {
        customer: {
          select: {
            primaryTeacherId: true
          }
        }
      }
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, folder.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // INV-4: relocate moves only DIRECT child materials up one level, so the
    // assigned-teacher gate is scoped to those directly-affected booking-linked
    // materials. Any failure rejects the whole operation before any write.
    const directMaterials = await prisma.learningMaterial.findMany({
      where: {
        folderId: folder.id
      },
      include: {
        booking: {
          select: {
            assignedTeacherId: true
          }
        }
      }
    });
    for (const material of directMaterials) {
      if (material.bookingId && !canManageAssignedTeacher(admin, material.booking?.assignedTeacherId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await prisma.$transaction([
      prisma.learningMaterial.updateMany({
        where: {
          folderId: folder.id
        },
        data: {
          folderId: folder.parentId
        }
      }),
      prisma.studentMaterialFolder.updateMany({
        where: {
          parentId: folder.id
        },
        data: {
          parentId: folder.parentId
        }
      }),
      prisma.studentMaterialFolder.delete({
        where: {
          id: folder.id
        }
      })
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete material folder.");
  }
}
