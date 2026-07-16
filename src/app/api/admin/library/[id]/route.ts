import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { deleteLibraryItem, replaceLibraryItemFile } from "@/lib/library/library-service";
import { logError } from "@/lib/observability";
import { streamMaterialBlob } from "@/lib/student-portal/material-response";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { classifyLearningMaterialFile } from "@/lib/student-portal/materials";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_MATERIAL_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Streams the master file of a library item for admin preview/download. Auth is
 * canManageLibrary (any admin); the shared streamMaterialBlob owns the byte path.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const item = await prisma.libraryItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const storage = createMaterialStorageDriver();
    return await streamMaterialBlob(
      storage,
      {
        storageKey: item.storageKey,
        mimeType: item.mimeType,
        title: item.title,
        materialType: item.materialType,
        originalFilename: item.originalFilename
      },
      request,
      { notFoundMessage: "Library item not found." }
    );
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load library item.");
  }
}

const updateLibraryItemSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional()
});

/**
 * Updates a library item's title/description (master metadata seen by all
 * assignees on their next portal load). Gated by canManageLibrary.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.libraryItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const parsed = updateLibraryItemSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid updates.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.libraryItem.update({
      where: { id },
      data: {
        title: parsed.data.title !== undefined ? parsed.data.title : existing.title,
        description: parsed.data.description !== undefined ? parsed.data.description : existing.description
      }
    });

    return NextResponse.json({
      item: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        materialType: updated.materialType,
        mimeType: updated.mimeType,
        sizeBytes: updated.sizeBytes,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update library item.");
  }
}

/**
 * Replaces the master file (write-new-key → pointer-swap → delete-old, via
 * replaceLibraryItemFile) so a failed write can never corrupt the live master
 * that every assignee streams (AC-replace). Gated by canManageLibrary.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.libraryItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const form = await request.formData().catch((error) => {
      logError("api.library.form_data_failed", error);
      return null;
    });
    if (!form) {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Replacement file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_MATERIAL_SIZE_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 100MB." }, { status: 400 });
    }

    const classification = classifyLearningMaterialFile({
      fileName: file.name,
      mimeType: file.type
    });
    if (!classification) {
      return NextResponse.json(
        { error: "Only PDF, common audio, and image files (JPEG, PNG, GIF, WebP) are supported." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const updated = await replaceLibraryItemFile({
        libraryItemId: existing.id,
        oldStorageKey: existing.storageKey,
        buffer,
        materialType: classification.materialType,
        mimeType: classification.mimeType,
        extension: classification.extension,
        sizeBytes: file.size
      });

      return NextResponse.json({
        item: {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          materialType: updated.materialType,
          mimeType: updated.mimeType,
          sizeBytes: updated.sizeBytes,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString()
        }
      });
    } catch (error) {
      // The service already compensated any stray new blob and left the old
      // master intact; surface a 500 without corrupting the live item.
      logError("library.replace_failed", error, { id: existing.id });
      return NextResponse.json(
        { error: "Unable to replace library file. The existing file is unchanged." },
        { status: 500 }
      );
    }
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to replace library file.");
  }
}

/**
 * Deletes a library item (cascades its tags-join + assignments and best-effort
 * deletes the master blob; shared Tag rows persist). Gated by canManageLibrary.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.libraryItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    await deleteLibraryItem({ libraryItemId: existing.id, storageKey: existing.storageKey });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete library item.");
  }
}
