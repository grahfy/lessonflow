import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/observability";
import { streamMaterialBlob } from "@/lib/student-portal/material-response";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Streams one learning material file for admin preview/download.
 */
export async function GET(request: NextRequest, { params }: Params) {
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
    if (material.bookingId && !canManageAssignedTeacher(admin, material.booking?.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const storage = createMaterialStorageDriver();

    // Auth verified above; the byte path (get -> 404 -> disposition -> range) is
    // shared with the student and library read routes via streamMaterialBlob.
    return await streamMaterialBlob(
      storage,
      {
        storageKey: material.storageKey,
        mimeType: material.mimeType,
        title: material.title,
        materialType: material.materialType
      },
      request,
      { notFoundMessage: "Learning material not found." }
    );
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load learning material.");
  }
}

/**
 * Deletes one learning material metadata row and attempts storage cleanup.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.learningMaterial.findUnique({
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
    if (!existing) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, existing.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.bookingId && !canManageAssignedTeacher(admin, existing.booking?.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete DB metadata first so the admin UI reflects removal immediately even if storage cleanup
    // later fails (cleanup errors are logged for follow-up).
    await prisma.learningMaterial.delete({
      where: {
        id
      }
    });

    const storage = createMaterialStorageDriver();
    await storage
      .delete({
        storageKey: existing.storageKey
      })
      .catch((error) => {
        // Storage cleanup is best-effort because the primary user-visible action (metadata removal)
        // has already succeeded.
        logError("learning_material.storage_delete_failed", error, {
          id: existing.id,
          storageKey: existing.storageKey
        });
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete learning material.");
  }
}

const updateMaterialSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional()
});

/**
 * Updates a single learning material's title and description.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.learningMaterial.findUnique({
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

    if (!existing) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, existing.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.bookingId && !canManageAssignedTeacher(admin, existing.booking?.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = updateMaterialSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid updates.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.learningMaterial.update({
      where: {
        id
      },
      data: {
        title: parsed.data.title !== undefined ? parsed.data.title : existing.title,
        description: parsed.data.description !== undefined ? parsed.data.description : existing.description
      }
    });

    return NextResponse.json({
      material: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        bookingId: updated.bookingId,
        folderId: updated.folderId,
        materialType: updated.materialType,
        mimeType: updated.mimeType,
        sizeBytes: updated.sizeBytes,
        createdAt: updated.createdAt.toISOString()
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update learning material.");
  }
}
