import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { buildLearningMaterialStorageKey } from "@/lib/student-portal/materials";
import { normalizeFolderName } from "@/lib/student-portal/folders";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const copyFolderSchema = z.object({
  parentId: z.string().trim().min(1).nullable().optional()
});

/**
 * Recursively copies a folder and its contents (materials and child folders).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const folder = await prisma.studentMaterialFolder.findUnique({
      where: { id },
      include: {
        customer: {
          select: { primaryTeacherId: true }
        }
      }
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, folder.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = copyFolderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid target parent.", details: parsed.error.flatten() }, { status: 400 });
    }

    const targetParentId = parsed.data.parentId !== undefined ? parsed.data.parentId : folder.parentId;

    // Validate the destination parent folder belongs to the same customer if not root
    if (targetParentId) {
      const destParent = await prisma.studentMaterialFolder.findUnique({
        where: { id: targetParentId }
      });
      if (!destParent) {
        return NextResponse.json({ error: "Target parent folder not found." }, { status: 400 });
      }
      if (destParent.customerId !== folder.customerId) {
        return NextResponse.json({ error: "Target parent folder belongs to a different customer." }, { status: 400 });
      }
    }

    const activeCustomerId = folder.customerId;
    const activeAdminId = admin.id;
    const storage = createMaterialStorageDriver();

    // Recursive helper to duplicate folders and materials
    async function duplicateFolder(originalId: string, destParentId: string | null, isTopLevel: boolean): Promise<string> {
      const currentFolder = await prisma.studentMaterialFolder.findUniqueOrThrow({
        where: { id: originalId },
        include: {
          materials: true,
          children: true
        }
      });

      let name = currentFolder.name;
      if (isTopLevel) {
        const siblings = await prisma.studentMaterialFolder.findMany({
          where: {
            customerId: activeCustomerId,
            parentId: destParentId
          }
        });
        const baseName = `Copy of ${currentFolder.name}`;
        name = baseName;
        let count = 1;
        while (siblings.some((s) => normalizeFolderName(s.name) === normalizeFolderName(name))) {
          name = `${baseName} (${count})`;
          count++;
        }
      }

      const newFolder = await prisma.studentMaterialFolder.create({
        data: {
          customerId: activeCustomerId,
          parentId: destParentId,
          name
        }
      });

      // Copy materials
      for (const mat of currentFolder.materials) {
        const lastDotIdx = mat.storageKey.lastIndexOf(".");
        const extension = lastDotIdx !== -1 ? mat.storageKey.slice(lastDotIdx) : "";
        const newStorageKey = buildLearningMaterialStorageKey({
          customerId: activeCustomerId,
          bookingId: mat.bookingId,
          extension
        });

        const fileBlob = await storage.get({ storageKey: mat.storageKey });
        await storage.put({
          storageKey: newStorageKey,
          buffer: fileBlob.buffer,
          mimeType: mat.mimeType
        });

        await prisma.learningMaterial.create({
          data: {
            customerId: activeCustomerId,
            bookingId: mat.bookingId,
            folderId: newFolder.id,
            // Never inherit the source row's order key into the copied folder.
            sortOrder: 0,
            uploadedById: activeAdminId,
            title: mat.title,
            description: mat.description,
            materialType: mat.materialType,
            storageKey: newStorageKey,
            mimeType: mat.mimeType,
            sizeBytes: mat.sizeBytes
          }
        });
      }

      // Assigned library items are deliberately NOT copied. A folder copy is
      // always same-customer (`activeCustomerId` is bound to `folder.customerId`
      // and a cross-customer destination parent is rejected above), and
      // `@@unique([libraryItemId, customerId])` means a student can hold exactly
      // one assignment per item. There is nothing to duplicate: the student
      // already has the item, and it stays in the source folder. Relocating it
      // into the copy would silently REMOVE it from the original, which is a
      // move, not a copy. So the copied folder contains no library items by
      // design. Pinned by tests/material-folder-library-placement.test.ts.

      // Copy children
      for (const child of currentFolder.children) {
        await duplicateFolder(child.id, newFolder.id, false);
      }

      return newFolder.id;
    }

    const copiedFolderId = await duplicateFolder(id, targetParentId, true);

    const resultFolder = await prisma.studentMaterialFolder.findUniqueOrThrow({
      where: { id: copiedFolderId }
    });

    return NextResponse.json({
      folder: {
        id: resultFolder.id,
        parentId: resultFolder.parentId,
        name: resultFolder.name,
        sourceBookingId: resultFolder.sourceBookingId
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to copy material folder.");
  }
}
