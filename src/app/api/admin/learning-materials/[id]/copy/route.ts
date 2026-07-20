import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManagePrimaryTeacherCustomer, canManageAssignedTeacher } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { buildLearningMaterialStorageKey } from "@/lib/student-portal/materials";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const copyMaterialSchema = z.object({
  folderId: z.string().trim().min(1).nullable().optional()
});

/**
 * Copies a single learning material file to another destination folder (or root).
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
    if (!canManagePrimaryTeacherCustomer(admin, material.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (material.bookingId && !canManageAssignedTeacher(admin, material.booking?.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = copyMaterialSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid copy target.", details: parsed.error.flatten() }, { status: 400 });
    }

    const targetFolderId = parsed.data.folderId !== undefined ? parsed.data.folderId : material.folderId;

    // Validate the destination folder belongs to the same customer
    if (targetFolderId) {
      const folder = await prisma.studentMaterialFolder.findUnique({
        where: { id: targetFolderId }
      });
      if (!folder) {
        return NextResponse.json({ error: "Target folder not found." }, { status: 400 });
      }
      if (folder.customerId !== material.customerId) {
        return NextResponse.json({ error: "Target folder belongs to a different customer." }, { status: 400 });
      }
    }

    const storage = createMaterialStorageDriver();
    const lastDotIdx = material.storageKey.lastIndexOf(".");
    const extension = lastDotIdx !== -1 ? material.storageKey.slice(lastDotIdx) : "";
    const newStorageKey = buildLearningMaterialStorageKey({
      customerId: material.customerId,
      bookingId: material.bookingId,
      extension
    });

    // Get and copy physical file
    const fileBlob = await storage.get({ storageKey: material.storageKey });
    await storage.put({
      storageKey: newStorageKey,
      buffer: fileBlob.buffer,
      mimeType: material.mimeType
    });

    // Create unique title
    const existingInDest = await prisma.learningMaterial.findMany({
      where: {
        customerId: material.customerId,
        folderId: targetFolderId
      },
      select: { title: true }
    });

    const baseTitle = `Copy of ${material.title}`;
    let title = baseTitle;
    let count = 1;
    while (existingInDest.some((m) => m.title.toLowerCase() === title.toLowerCase())) {
      title = `${baseTitle} (${count})`;
      count++;
    }

    // Create DB record
    const newMaterial = await prisma.learningMaterial.create({
      data: {
        customerId: material.customerId,
        bookingId: material.bookingId,
        folderId: targetFolderId,
        // Never inherit the source row's order key into the destination folder.
        sortOrder: 0,
        uploadedById: admin.id,
        title,
        description: material.description,
        materialType: material.materialType,
        storageKey: newStorageKey,
        mimeType: material.mimeType,
        sizeBytes: material.sizeBytes
      }
    });

    return NextResponse.json({
      material: {
        id: newMaterial.id,
        title: newMaterial.title,
        description: newMaterial.description,
        bookingId: newMaterial.bookingId,
        folderId: newMaterial.folderId,
        materialType: newMaterial.materialType,
        mimeType: newMaterial.mimeType,
        sizeBytes: newMaterial.sizeBytes,
        createdAt: newMaterial.createdAt.toISOString()
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to copy learning material.");
  }
}
